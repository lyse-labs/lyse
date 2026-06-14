import type { ConnectorClient } from "./connectors/types.js";
import type { GovernanceSignals } from "../reliability/governance-maturity.js";
import { extractJson, withTimeout } from "./llm-utils.js";

/**
 * LLM tier of the AI-Governance Maturity Level (Track #72 / #155). Where the
 * deterministic detector fails — a DS whose AI affordances are *semantic* (e.g.
 * AWS Cloudscape's generative-AI labels/patterns, with no name-detectable
 * marker component) — Claude reads the AI-relevant context and reports the
 * objective **signals** it finds, plus confidence and a cited evidence string.
 *
 * IMPORTANT (external-validity honesty): the judge reports SIGNALS, never a
 * Kavcic level. The level is computed by Lyse's own `computeGovernanceMaturityLevel`
 * mapping — so the #72 correlation vs Kavcic stays an independent test, not
 * Claude reproducing Kavcic's rubric (which would be circular). §0ter
 * circularity is thereby reduced to "did Claude detect this affordance," not
 * "did Claude assign Kavcic's level"; the external anchor remains Kavcic (#72).
 *
 * The judge only ADDS signals the deterministic pass missed — the caller ORs it
 * with the deterministic signals, gated by a conformal confidence threshold.
 */

export interface MaturityJudgeInput {
  repoName: string;
  /** AI-relevant context (concatenated snippets / docs) gathered upstream. */
  aiContext: string;
}

export interface MaturityJudgement {
  signals: GovernanceSignals;
  confidence: number; // 0–1
  evidence: string;
}

export interface MaturityJudgeOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

function buildPrompt(input: MaturityJudgeInput): string {
  return [
    "You are auditing a design system's AI-governance affordances. Read the AI-relevant",
    "context and answer four OBJECTIVE presence questions — do NOT assign an overall score or level.",
    "",
    `Design system: ${input.repoName}`,
    "Context extracted from the repository:",
    "```",
    input.aiContext.slice(0, 40_000),
    "```",
    "",
    "Answer (true only with concrete evidence in the context):",
    "  hasReservedAiTokens — design tokens / color roles specifically for AI-generated content.",
    "  hasMarkerComponent — a dedicated component/label/badge/avatar that marks content as AI-generated.",
    "  hasInteractionAffordance — AI interaction patterns: loading/streaming/error states, feedback controls, or live regions for AI output.",
    "  hasGovernanceAffordance — AI governance: disclaimers, explainability, human-control/override, or a responsible-AI rubric.",
    "",
    "Reason step by step, then output ONLY JSON:",
    '{ "hasReservedAiTokens": <bool>, "hasMarkerComponent": <bool>, "hasInteractionAffordance": <bool>, "hasGovernanceAffordance": <bool>, "confidence": <0-1>, "evidence": "<exact phrase/identifier copied from the context>" }',
    "confidence is your calibrated certainty in these answers; reserve >0.9 for clear-cut cases. evidence MUST be a real string copied from the context.",
  ].join("\n");
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Returns validated semantic governance signals, or null on any failure
 * (connector error/empty, parse error, missing booleans, or empty evidence —
 * the anti-hallucination floor). Fail-safe: the caller keeps the deterministic
 * signals when this returns null.
 */
export async function judgeGovernanceMaturity(
  input: MaturityJudgeInput,
  connector: ConnectorClient,
  opts: MaturityJudgeOptions = {},
): Promise<MaturityJudgement | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let result;
  try {
    result = await withTimeout(
      connector.complete([{ role: "user", content: buildPrompt(input) }]),
      timeoutMs,
    );
  } catch {
    return null;
  }

  if (result.text === "") return null;

  let raw: unknown;
  try {
    raw = extractJson(result.text);
  } catch {
    return null;
  }

  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const keys = [
    "hasReservedAiTokens",
    "hasMarkerComponent",
    "hasInteractionAffordance",
    "hasGovernanceAffordance",
  ] as const;
  for (const k of keys) {
    if (typeof o[k] !== "boolean") return null;
  }
  const confidence = o["confidence"];
  const evidence = o["evidence"];
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  if (typeof evidence !== "string" || evidence.trim() === "") return null;

  return {
    signals: {
      hasReservedAiTokens: o["hasReservedAiTokens"] as boolean,
      hasMarkerComponent: o["hasMarkerComponent"] as boolean,
      hasInteractionAffordance: o["hasInteractionAffordance"] as boolean,
      hasGovernanceAffordance: o["hasGovernanceAffordance"] as boolean,
    },
    confidence: clamp01(confidence),
    evidence,
  };
}
