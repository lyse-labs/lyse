import type { ConnectorClient } from "../../llm/connectors/types.js";
import { resolveConnector } from "../../llm/connectors/resolver.js";
import { extractJson } from "../../llm/llm-utils.js";
import type { FindingRow } from "../../../../scripts/harvest-findings.js";

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

function buildJudgePrompt(rows: FindingRow[]): string {
  const findingLines = rows.map((r, i) => {
    return `${i} — ${r.file}:${r.line} — ${r.ruleId} — ${JSON.stringify(r.snippet)}`;
  });

  return [
    "You are a design-system lint auditor. Below is a list of candidate drift findings from a design-system codebase. For each finding, judge whether it is a true violation (tp), a false positive (fp), or genuinely uncertain.",
    "",
    "Corpus-validated rubric:",
    "  - A hardcoded color in an inline style/css/sx prop IS a violation (inline CSS drift), NOT a theming-API surface.",
    "  - A color that is subject data of a color-picker / swatch / palette component IS palette data, NOT drift — fp.",
    "  - Hardcoded values in demo / story / Storybook / example / playground files are low-signal — fp.",
    "  - A hardcoded value already sourced from a token (via var() or token reference) is fp.",
    "",
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

  const byFile = new Map<string, FindingRow[]>();
  for (const row of rows) {
    if (!byFile.has(row.file)) byFile.set(row.file, []);
    byFile.get(row.file)!.push(row);
  }

  for (const [, fileRows] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const prompt = buildJudgePrompt(fileRows);

    let text: string;
    try {
      const res = await connector.complete([{ role: "user", content: prompt }]);
      text = res.text;
    } catch {
      for (const row of fileRows) {
        result.set(row, { ...UNCERTAIN_FALLBACK });
      }
      continue;
    }

    if (text === "") {
      for (const row of fileRows) {
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
      for (const row of fileRows) {
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

    fileRows.forEach((row, i) => {
      const v = verdictMap.get(i);
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
