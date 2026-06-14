import type { AxisName, Finding, Layer4Meta, LyseConfig, Severity } from "../types.js";
import type { AuditFlags } from "../commands/audit-flags.js";
import type { ConnectorClient } from "./connectors/types.js";
import { resolveConnector } from "./connectors/resolver.js";
import type { RubricDimension } from "./rubric.js";
import { getRubricDimensions } from "./rubric.js";
import type { ProposedFinding } from "./validator.js";
import { validateProposedFindings } from "./validator.js";
import { extractJson, withTimeout } from "./llm-utils.js";

export interface Layer4StageInput {
  repoRoot: string;
  config: LyseConfig;
  flags: AuditFlags | undefined;
  staticFindings: Finding[];
}

export interface Layer4StageResult {
  augmentedFindings: Finding[];
  meta: Layer4Meta;
}

export interface Layer4StageOptions {
  connector?: ConnectorClient;
  rubricDimensions?: RubricDimension[];
  timeoutMs?: number;
}

interface LLMFindingsResponse {
  findings: unknown[];
}

const VALID_SEVERITIES = new Set<Severity>(["error", "warning", "info"]);
const VALID_AXES = new Set<AxisName>([
  "tokens",
  "a11y",
  "components",
  "stories",
  "ai-surface",
  "ai-governance",
]);
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_LLM_FINDINGS = 100;

function isProposedFinding(v: unknown): v is ProposedFinding {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o["ruleId"] !== "string" || o["ruleId"] === "") return false;
  if (typeof o["axis"] !== "string" || !VALID_AXES.has(o["axis"] as AxisName)) return false;
  if (typeof o["severity"] !== "string" || !VALID_SEVERITIES.has(o["severity"] as Severity)) return false;
  if (typeof o["file"] !== "string" || o["file"] === "" || o["file"].includes("\0")) return false;
  if (typeof o["line"] !== "number" || !Number.isFinite(o["line"]) || o["line"] < 1) return false;
  if (typeof o["column"] !== "number" || !Number.isFinite(o["column"]) || o["column"] < 1) return false;
  if (typeof o["snippet"] !== "string") return false;
  if (typeof o["message"] !== "string" || o["message"] === "") return false;
  return true;
}

function dedupAgainstStatic(
  proposed: ProposedFinding[],
  staticFindings: Finding[],
): ProposedFinding[] {
  const seen = new Set<string>();
  for (const f of staticFindings) {
    seen.add(`${f.ruleId}|${f.location.file}|${f.location.line}`);
  }
  return proposed.filter((p) => !seen.has(`${p.ruleId}|${p.file}|${p.line}`));
}

function buildPrompt(dimensions: RubricDimension[], staticFindings: Finding[]): string {
  const dimSection = dimensions
    .map((d, i) => `${i + 1}. [${d.key}] ${d.prompt}`)
    .join("\n");

  const staticSummary =
    staticFindings.length === 0
      ? "No static findings."
      : staticFindings
          .slice(0, 20)
          .map((f) => `- ${f.ruleId} @ ${f.location.file}:${f.location.line} — ${f.message}`)
          .join("\n");

  return [
    "You are a design-system governance auditor. Analyze the following dimensions and identify violations.",
    "",
    "## Dimensions to audit",
    dimSection,
    "",
    "## Static findings context (already detected, do not repeat)",
    staticSummary,
    "",
    "## Output format",
    "Return ONLY valid JSON (no markdown, no explanation) matching:",
    '{ "findings": [ { "ruleId": string, "axis": string, "severity": "error"|"warning"|"info", "file": string, "line": number, "column": number, "snippet": string, "message": string, "confidence": number } ] }',
    "",
    "CRITICAL: Every finding MUST cite a real file path and an exact code snippet (at least 20 chars) from that file.",
    "`confidence` is your certainty that this is a genuine governance violation, in [0,1]. Be calibrated; reserve >0.9 for clear-cut cases.",
    'If you have no findings, return: { "findings": [] }',
  ].join("\n");
}

export async function runLayer4Stage(
  input: Layer4StageInput,
  opts: Layer4StageOptions = {},
): Promise<Layer4StageResult> {
  const staticOnly =
    input.flags?.staticOnly === true || input.config.llm?.staticOnly === true;

  if (staticOnly) {
    return { augmentedFindings: [], meta: { staticOnly: true } };
  }

  // Opt out of LLM augmentation only (governance grader) while leaving the
  // precision filter active — used by the filtered-precision calibration harness
  // and available to CI/perf runs that want the filter without the slower grader.
  if (process.env["LYSE_SKIP_LAYER4_AUGMENTATION"] === "1") {
    return { augmentedFindings: [], meta: {} };
  }

  const dimensions = opts.rubricDimensions ?? getRubricDimensions();

  if (dimensions.length === 0) {
    return { augmentedFindings: [], meta: {} };
  }

  const connector =
    opts.connector ?? resolveConnector(input.config, input.flags);

  const prompt = buildPrompt(dimensions, input.staticFindings);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let connectorResult;
  try {
    connectorResult = await withTimeout(
      connector.complete([{ role: "user", content: prompt }]),
      timeoutMs,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      augmentedFindings: [],
      meta: { error: { kind: "ConnectorError", message } },
    };
  }

  if (connectorResult.text === "") {
    return { augmentedFindings: [], meta: {} };
  }

  let parsed: LLMFindingsResponse;
  try {
    const raw = extractJson(connectorResult.text);
    if (
      typeof raw !== "object" ||
      raw === null ||
      !Array.isArray((raw as Record<string, unknown>)["findings"])
    ) {
      throw new Error("Response missing 'findings' array");
    }
    parsed = raw as LLMFindingsResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      augmentedFindings: [],
      meta: {
        modelUsed: connectorResult.modelUsed,
        usdSpent: connectorResult.usdSpent,
        llmQuality: connectorResult.llmQuality,
        cacheHit: connectorResult.cacheHit,
        error: { kind: "ParseError", message },
      },
    };
  }

  const cappedRaw = parsed.findings.slice(0, MAX_LLM_FINDINGS);
  const proposed = cappedRaw.filter(isProposedFinding);
  const deduped = dedupAgainstStatic(proposed, input.staticFindings);
  const { findings, droppedHallucinations } = await validateProposedFindings(
    deduped,
    input.repoRoot,
  );

  const meta: Layer4Meta = {
    modelUsed: connectorResult.modelUsed,
    usdSpent: connectorResult.usdSpent,
    llmQuality: connectorResult.llmQuality,
    cacheHit: connectorResult.cacheHit,
    droppedHallucinations,
  };

  return { augmentedFindings: findings, meta };
}
