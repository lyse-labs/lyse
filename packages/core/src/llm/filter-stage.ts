import type { Finding, LyseConfig } from "../types.js";
import type { AuditFlags } from "../commands/audit-flags.js";
import type { ConnectorClient } from "./connectors/types.js";
import { resolveConnector } from "./connectors/resolver.js";

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

function extractJson(text: string): unknown {
  const jsonFenced = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonFenced && jsonFenced[1]) return JSON.parse(jsonFenced[1].trim());
  const anyFenced = text.match(/```\s*([\s\S]*?)```/);
  if (anyFenced && anyFenced[1]) return JSON.parse(anyFenced[1].trim());
  return JSON.parse(text);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`LLM connector timeout after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

interface Verdict {
  index: number;
  keep: boolean;
}

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
    'You are a design-system lint auditor. Below is a source file and a list of candidate "hardcoded value" findings (raw hex colors / px spacing that may be design-system violations). Some are FALSE POSITIVES: values that are NOT design-system violations — e.g. chart/data-viz palette colors, icon SVG fills, third-party embed theme config, canvas/PDF rendering, test fixtures, values inside comments, or values already coming from a token. For EACH finding decide keep (real violation worth flagging) or drop (false positive).',
    "",
    `FILE: ${relativePath}`,
    "```",
    source,
    "```",
    "",
    "FINDINGS (index — line:col — ruleId — message — snippet):",
    ...findingLines,
    "",
    'Return ONLY JSON, no prose: { "verdicts": [ { "index": <n>, "keep": <bool> } ] }',
    "Include every index exactly once.",
  ].join("\n");
}

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
  let filterRan = false;
  let totalUsdSpent = 0;
  let lastModelUsed: string | undefined;
  let bailed = false;

  for (const file of sortedFiles) {
    if (bailed) break;

    const allFileFIndings = byFile.get(file)!;
    const source = input.fileContents.get(file);

    // Missing source → keep all (fail-safe)
    if (source === undefined) {
      continue;
    }

    // Source too large → keep all
    if (source.length > MAX_FILE_CHARS) {
      continue;
    }

    // Cap findings per file; overflow is kept (only judge the first MAX_FINDINGS_PER_FILE)
    const judgedFindings = allFileFIndings.slice(0, MAX_FINDINGS_PER_FILE);
    // overflowFindings (index >= MAX_FINDINGS_PER_FILE) are implicitly kept (not in droppedKeys)

    const prompt = buildFilterPrompt(file, source, judgedFindings);

    let result;
    try {
      result = await withTimeout(
        connector.complete([{ role: "user", content: prompt }]),
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

    // Apply verdicts: drop only explicit keep=false; out-of-range/missing → keep
    for (const verdict of parsed.verdicts) {
      if (
        typeof verdict.index !== "number" ||
        !Number.isFinite(verdict.index) ||
        verdict.index < 0 ||
        verdict.index >= judgedFindings.length
      ) {
        continue; // out-of-range → ignore (keep)
      }
      if (verdict.keep === false) {
        const finding = judgedFindings[verdict.index];
        if (finding !== undefined) {
          droppedKeys.add(findingKey(finding));
        }
      }
    }
  }

  const kept = input.findings.filter((f) => !droppedKeys.has(findingKey(f)));
  const filteredCount = droppedKeys.size;

  const meta: FilterStageResult["meta"] = {
    filterRan,
    filteredCount,
    ...(lastModelUsed !== undefined ? { modelUsed: lastModelUsed } : {}),
    ...(filterRan ? { usdSpent: totalUsdSpent } : {}),
  };

  return { findings: kept, meta };
}
