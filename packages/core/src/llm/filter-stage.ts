import type { Finding, LyseConfig, LlmJudgement, LlmVerdict } from "../types.js";
import type { AuditFlags } from "../commands/audit-flags.js";
import type { ConnectorClient } from "./connectors/types.js";
import { resolveConnector } from "./connectors/resolver.js";
import { extractJson, withTimeout } from "./llm-utils.js";
import { containsLikelySecret } from "./secret-scan.js";

export interface FilterStageInput {
  repoRoot: string;
  config: LyseConfig;
  flags: AuditFlags | undefined;
  findings: Finding[];
  fileContents: Map<string, string>; // keyed by RELATIVE path (== finding.location.file)
}

export interface FilterStageResult {
  findings: Finding[]; // filtered (kept) findings, full list incl. untouched non-target findings
  meta: {
    filterRan: boolean;
    filteredCount: number;
    /** True when the stage stopped early after an empty (Noop/budget-exhausted) response — remaining files were not judged. */
    bailed?: boolean;
    modelUsed?: string;
    usdSpent?: number;
  };
}

export interface FilterStageOptions {
  connector?: ConnectorClient; // injected in tests → zero real spawn
  timeoutMs?: number;
}

/** Only these rules are sent to the LLM filter for FP suppression. */
const TARGET_RULES = new Set(["tokens/no-hardcoded-color", "tokens/no-hardcoded-spacing"]);

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_FILE_CHARS = 60_000;
const MAX_FINDINGS_PER_FILE = 50;

interface Verdict {
  index: number;
  // Phase D: three-way verdict + self-reported confidence.
  verdict?: string;
  confidence?: number;
  // Legacy (pre-D1) binary form — still accepted for robustness.
  keep?: boolean;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// JSON Schema for structured output (#145) — SDK adapters force this shape.
const FILTER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          verdict: { type: "string", enum: ["violation", "fp", "uncertain"] },
          confidence: { type: "number" },
        },
        required: ["index", "verdict"],
      },
    },
  },
  required: ["verdicts"],
};

interface VerdictsResponse {
  verdicts: Verdict[];
}

function isVerdictsResponse(v: unknown): v is VerdictsResponse {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o["verdicts"])) return false;
  return true;
}

function findingKey(f: Finding): string {
  return `${f.ruleId}|${f.location.file}|${f.location.line}|${f.location.column}`;
}

function buildFilterPrompt(relativePath: string, source: string, findings: Finding[]): string {
  const findingLines = findings.map((f, i) => {
    const loc = `${f.location.line}:${f.location.column}`;
    const snippet = f.context ?? "";
    return `${i} — ${loc} — ${f.ruleId} — ${f.message} — ${JSON.stringify(snippet)}`;
  });

  return [
    'You are a design-system lint auditor. Below is a source file and a list of candidate "hardcoded value" findings (raw hex colors / px spacing that may be design-system violations). Some are FALSE POSITIVES: values that are NOT design-system violations — e.g. chart/data-viz palette colors, icon SVG fills, third-party embed theme config, canvas/PDF rendering, test fixtures, values inside comments, or values already coming from a token.',
    "",
    "Corpus-validated rubric (apply these exactly — they were the recall/precision pivots on real design systems):",
    "  - A hardcoded color in an inline `style`/`css`/`sx` prop IS a violation (it is inline CSS / drift), NOT a theming-API surface. Do not drop it as embed/theme config.",
    "  - A color that is the SUBJECT DATA of a color-picker / swatch / palette component (its default/value/options) IS palette data, NOT drift — drop it as a false positive.",
    "  - Hardcoded values in demo / story / Storybook / example / playground files are low-signal — drop them as false positives.",
    "",
    "For EACH finding return a verdict and your confidence in it:",
    '  - "violation" — a real design-system violation worth flagging.',
    '  - "fp" — a false positive that should be dropped.',
    '  - "uncertain" — genuinely ambiguous; you cannot confidently decide.',
    "  - confidence — a number in [0,1]: your certainty in that verdict. Be calibrated; reserve >0.9 for clear-cut cases.",
    "",
    `FILE: ${relativePath}`,
    "```",
    source,
    "```",
    "",
    "FINDINGS (index — line:col — ruleId — message — snippet):",
    ...findingLines,
    "",
    'Return ONLY JSON, no prose: { "verdicts": [ { "index": <n>, "verdict": "violation"|"fp"|"uncertain", "confidence": <0..1> } ] }',
    "Include every index exactly once.",
  ].join("\n");
}

export const _internal = { buildFilterPrompt };

export async function runFilterStage(
  input: FilterStageInput,
  opts?: FilterStageOptions,
): Promise<FilterStageResult> {
  // Opt-out: staticOnly flag or config
  const staticOnly =
    input.flags?.staticOnly === true || input.config.llm?.staticOnly === true;
  if (staticOnly) {
    return { findings: input.findings, meta: { filterRan: false, filteredCount: 0 } };
  }

  // Separate target findings from pass-through findings
  const targetFindings = input.findings.filter((f) => TARGET_RULES.has(f.ruleId));

  // No target findings → pass through
  if (targetFindings.length === 0) {
    return { findings: input.findings, meta: { filterRan: false, filteredCount: 0 } };
  }

  const connector = opts?.connector ?? resolveConnector(input.config, input.flags);
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Group target findings by file (sorted for determinism)
  const byFile = new Map<string, Finding[]>();
  for (const f of targetFindings) {
    const file = f.location.file;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(f);
  }
  const sortedFiles = [...byFile.keys()].sort();

  const droppedKeys = new Set<string>();
  const judgementByKey = new Map<string, LlmJudgement>();
  let filterRan = false;
  let totalUsdSpent = 0;
  let lastModelUsed: string | undefined;
  let bailed = false;

  for (const file of sortedFiles) {
    if (bailed) break;

    const allFileFindings = byFile.get(file)!;
    const source = input.fileContents.get(file);

    // Missing source → keep all (fail-safe)
    if (source === undefined) {
      continue;
    }

    // Source too large → keep all
    if (source.length > MAX_FILE_CHARS) {
      continue;
    }

    // Source contains a likely secret → never send it to the LLM; keep all
    // its findings (fail-safe). PRIVACY.md guarantees this exclusion.
    if (containsLikelySecret(source)) {
      continue;
    }

    // Cap findings per file; overflow is kept (only judge the first MAX_FINDINGS_PER_FILE)
    const judgedFindings = allFileFindings.slice(0, MAX_FINDINGS_PER_FILE);
    // overflowFindings (index >= MAX_FINDINGS_PER_FILE) are implicitly kept (not in droppedKeys)

    const prompt = buildFilterPrompt(file, source, judgedFindings);

    let result;
    try {
      result = await withTimeout(
        connector.complete([{ role: "user", content: prompt }], { responseSchema: FILTER_RESPONSE_SCHEMA }),
        timeoutMs,
      );
    } catch {
      // Connector error → keep all for this file, continue
      continue;
    }

    // Empty text = Noop / budget exhausted → keep all and bail
    if (result.text === "") {
      bailed = true;
      break;
    }

    filterRan = true;
    totalUsdSpent += result.usdSpent ?? 0;
    if (result.modelUsed && result.modelUsed !== "") {
      lastModelUsed = result.modelUsed;
    }

    // Parse verdicts (fail-safe: keep all on any error)
    let parsed: VerdictsResponse;
    try {
      const raw = extractJson(result.text);
      if (!isVerdictsResponse(raw)) {
        continue; // keep all for this file
      }
      parsed = raw;
    } catch {
      continue; // keep all for this file
    }

    // Apply verdicts. A finding is dropped iff it's an explicit false positive
    // (verdict "fp" or legacy keep=false). "violation"/"uncertain" are kept; a
    // valid verdict + numeric confidence is attached as llmJudgement for the
    // conformal scoring gate (D2). Out-of-range/missing → keep, no judgement.
    for (const verdict of parsed.verdicts) {
      if (
        typeof verdict.index !== "number" ||
        !Number.isFinite(verdict.index) ||
        verdict.index < 0 ||
        verdict.index >= judgedFindings.length
      ) {
        continue; // out-of-range → ignore (keep)
      }
      const finding = judgedFindings[verdict.index];
      if (finding === undefined) continue;

      const isFp = verdict.verdict === "fp" || verdict.keep === false;
      if (isFp) {
        droppedKeys.add(findingKey(finding));
        continue;
      }

      const v = verdict.verdict;
      if (
        (v === "violation" || v === "uncertain") &&
        typeof verdict.confidence === "number" &&
        Number.isFinite(verdict.confidence)
      ) {
        judgementByKey.set(findingKey(finding), {
          verdict: v as LlmVerdict,
          confidence: clamp01(verdict.confidence),
        });
      }
    }
  }

  const kept = input.findings
    .filter((f) => !droppedKeys.has(findingKey(f)))
    .map((f) => {
      const j = judgementByKey.get(findingKey(f));
      return j !== undefined ? { ...f, llmJudgement: j } : f;
    });
  // Count from the actual list delta, not droppedKeys.size: two findings can
  // share a ruleId|file|line|column key, so the Set would undercount.
  const filteredCount = input.findings.length - kept.length;

  const meta: FilterStageResult["meta"] = {
    filterRan,
    filteredCount,
    ...(bailed ? { bailed: true } : {}),
    ...(lastModelUsed !== undefined ? { modelUsed: lastModelUsed } : {}),
    ...(filterRan ? { usdSpent: totalUsdSpent } : {}),
  };

  return { findings: kept, meta };
}
