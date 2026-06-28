import type { ConnectorClient } from "../../llm/connectors/types.js";
import { resolveConnector } from "../../llm/connectors/resolver.js";
import { extractJson } from "../../llm/llm-utils.js";
import type { FindingRow } from "./finding-row.js";
import { findRuleMeta } from "../../rules/manifest.js";

export type JudgeLabel =
  | { verdict: "tp"; source: "llm-provisional"; confidence: number }
  | { verdict: "fp"; source: "llm-provisional"; confidence: number }
  | { verdict: "uncertain"; source: "llm-provisional"; confidence: number };

interface Verdict {
  index: number;
  verdict?: string;
  confidence?: number;
}

interface VerdictsResponse {
  verdicts: Verdict[];
}

function isVerdictsResponse(v: unknown): v is VerdictsResponse {
  if (typeof v !== "object" || v === null) return false;
  return Array.isArray((v as Record<string, unknown>)["verdicts"]);
}

export function buildJudgePrompt(rows: FindingRow[]): string {
  const findingLines = rows.map((r, i) => {
    return `${i} — ${r.file}:${r.line} — ${r.ruleId} — ${JSON.stringify(r.snippet)}`;
  });

  const distinctRuleIds = [...new Set(rows.map((r) => r.ruleId))].sort();

  const rubricBlocks: string[] = [];
  for (const ruleId of distinctRuleIds) {
    const meta = findRuleMeta(ruleId);
    if (meta === undefined) {
      rubricBlocks.push(`Rubric for ${ruleId}:`, `  - Judge whether this is a real violation of the ${ruleId} rule.`);
    } else {
      const lines: string[] = [`Rubric for ${ruleId} — ${meta.shortDescription}:`];
      for (const ex of meta.examples) {
        lines.push(`  - GOOD (not a violation): ${ex.good}`);
        lines.push(`  - BAD (violation): ${ex.bad}`);
      }
      for (const entry of meta.allowlist) {
        lines.push(`  - NOT a violation (allowlisted): ${entry}`);
      }
      rubricBlocks.push(...lines);
    }
    rubricBlocks.push("");
  }

  return [
    "You are a design-system lint auditor. Below is a list of candidate drift findings from a design-system codebase. For each finding, judge whether it is a true violation (tp), a false positive (fp), or genuinely uncertain.",
    "",
    "General heuristics (apply to all rules):",
    "  - Findings in demo / story / Storybook / example / playground files are low-signal — fp.",
    "  - A value already sourced from a token (via var() or a token reference) is fp.",
    "",
    "Rule-specific rubrics:",
    ...rubricBlocks,
    'For EACH finding return a verdict and your confidence in it:',
    '  - "violation" — a real design-system violation worth flagging (maps to tp).',
    '  - "fp" — a false positive that should be dropped.',
    '  - "uncertain" — genuinely ambiguous; you cannot confidently decide.',
    "  - confidence — a number in [0,1]: your certainty. Be calibrated; reserve >0.9 for clear-cut cases.",
    "",
    "FINDINGS (index — file:line — ruleId — snippet):",
    ...findingLines,
    "",
    'Return ONLY JSON, no prose: { "verdicts": [ { "index": <n>, "verdict": "violation"|"fp"|"uncertain", "confidence": <0..1> } ] }',
    "Include every index exactly once.",
  ].join("\n");
}

const BATCH_SIZE = 20;

const UNCERTAIN_FALLBACK: JudgeLabel = {
  verdict: "uncertain",
  source: "llm-provisional",
  confidence: 0,
};

function verdictToLabel(v: Verdict, confThreshold: number): JudgeLabel {
  const conf = typeof v.confidence === "number" && Number.isFinite(v.confidence)
    ? Math.min(1, Math.max(0, v.confidence))
    : 0;

  if (conf >= confThreshold) {
    if (v.verdict === "violation") {
      return { verdict: "tp", source: "llm-provisional", confidence: conf };
    }
    if (v.verdict === "fp") {
      return { verdict: "fp", source: "llm-provisional", confidence: conf };
    }
  }

  return { verdict: "uncertain", source: "llm-provisional", confidence: conf };
}

export async function judgeFindings(
  rows: FindingRow[],
  opts?: { connector?: ConnectorClient; confThreshold?: number },
): Promise<Map<FindingRow, JudgeLabel>> {
  const result = new Map<FindingRow, JudgeLabel>();
  if (rows.length === 0) return result;

  const confThreshold = opts?.confThreshold ?? 0.7;

  const connector: ConnectorClient = opts?.connector ?? resolveConnector({}, undefined);

  const sorted = [...rows].sort((a, b) => {
    const byRule = a.ruleId.localeCompare(b.ruleId);
    if (byRule !== 0) return byRule;
    const byRepo = a.repo.localeCompare(b.repo);
    if (byRepo !== 0) return byRepo;
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return a.line - b.line;
  });

  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const chunk = sorted.slice(i, i + BATCH_SIZE);
    const prompt = buildJudgePrompt(chunk);

    let text: string;
    try {
      const res = await connector.complete([{ role: "user", content: prompt }]);
      text = res.text;
    } catch {
      for (const row of chunk) {
        result.set(row, { ...UNCERTAIN_FALLBACK });
      }
      continue;
    }

    if (text === "") {
      for (const row of chunk) {
        result.set(row, { ...UNCERTAIN_FALLBACK });
      }
      continue;
    }

    let parsed: VerdictsResponse;
    try {
      const raw = extractJson(text);
      if (!isVerdictsResponse(raw)) {
        throw new Error("invalid shape");
      }
      parsed = raw;
    } catch {
      for (const row of chunk) {
        result.set(row, { ...UNCERTAIN_FALLBACK });
      }
      continue;
    }

    const verdictMap = new Map<number, Verdict>();
    for (const v of parsed.verdicts) {
      if (typeof v.index === "number" && Number.isFinite(v.index)) {
        verdictMap.set(v.index, v);
      }
    }

    chunk.forEach((row, idx) => {
      const v = verdictMap.get(idx);
      if (v === undefined) {
        result.set(row, { ...UNCERTAIN_FALLBACK });
      } else {
        result.set(row, verdictToLabel(v, confThreshold));
      }
    });
  }

  return result;
}

export function packetFor(
  ruleId: string,
  rows: { row: FindingRow; label: JudgeLabel }[],
): string {
  if (rows.length === 0) return "";

  const lines: string[] = [
    `## Human review packet: ${ruleId}`,
    "",
    `${rows.length} row(s) require human labelling (uncertain / low-confidence).`,
    "",
  ];

  for (const { row, label } of rows) {
    lines.push(`### ${row.repo} — ${row.file} line ${row.line}`);
    lines.push("");
    lines.push("```");
    lines.push(row.snippet);
    lines.push("```");
    lines.push("");
    lines.push(`- judge confidence: ${label.confidence}`);
    lines.push(`- rule: \`${row.ruleId}\``);
    lines.push(`- file type: ${row.fileType}`);
    lines.push("");
    lines.push("Label:");
    lines.push("- [ ] TP");
    lines.push("- [ ] FP");
    lines.push("");
  }

  return lines.join("\n");
}
