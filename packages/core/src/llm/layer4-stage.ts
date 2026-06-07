import type { Finding, Layer4Meta, LyseConfig } from "../types.js";
import type { AuditFlags } from "../commands/audit-flags.js";
import type { ConnectorClient } from "./connectors/types.js";
import { resolveConnector } from "./connectors/resolver.js";
import type { RubricDimension } from "./rubric-stub.js";
import { getStubRubricDimensions } from "./rubric-stub.js";
import type { ProposedFinding } from "./validator.js";
import { validateProposedFindings } from "./validator.js";

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
}

interface LLMFindingsResponse {
  findings: unknown[];
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced !== null ? fenced[1]?.trim() ?? text : text;
  return JSON.parse(raw);
}

function isProposedFinding(v: unknown): v is ProposedFinding {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["ruleId"] === "string" &&
    typeof o["axis"] === "string" &&
    typeof o["severity"] === "string" &&
    typeof o["file"] === "string" &&
    typeof o["line"] === "number" &&
    typeof o["column"] === "number" &&
    typeof o["snippet"] === "string" &&
    typeof o["message"] === "string"
  );
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
    '{ "findings": [ { "ruleId": string, "axis": string, "severity": "error"|"warning"|"info", "file": string, "line": number, "column": number, "snippet": string, "message": string } ] }',
    "",
    "CRITICAL: Every finding MUST cite a real file path and an exact code snippet from that file.",
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

  const dimensions = opts.rubricDimensions ?? getStubRubricDimensions();

  if (dimensions.length === 0) {
    return { augmentedFindings: [], meta: {} };
  }

  const connector =
    opts.connector ?? resolveConnector(input.config, input.flags);

  const prompt = buildPrompt(dimensions, input.staticFindings);

  let connectorResult;
  try {
    connectorResult = await connector.complete([{ role: "user", content: prompt }]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      augmentedFindings: [],
      meta: { error: { kind: "ConnectorError", message } },
    };
  }

  if (connectorResult.text === "") {
    return { augmentedFindings: [], meta: { staticOnly: true } };
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

  const proposed = parsed.findings.filter(isProposedFinding);
  const { findings, droppedHallucinations } = await validateProposedFindings(
    proposed,
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
