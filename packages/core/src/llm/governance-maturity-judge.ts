import type { ConnectorClient } from "./connectors/types.js";
import type { GovernanceSignals } from "../reliability/governance-maturity.js";
import { extractJson, withTimeout } from "./llm-utils.js";

/**
 * LLM tier of the AI-Governance Maturity Level (Track #72 / #155). Where the
 * deterministic detector fails — a DS whose AI affordances are *semantic* (e.g.
 * AWS Cloudscape's generative-AI label tokens, no name-detectable marker) —
 * Claude reads the AI-relevant context and reports the objective **signals** it
 * finds, each REQUIRING its own concrete cited evidence.
 *
 * Grounding (anti-over-detection): a signal counts as true only if the response
 * supplies a non-empty `evidence[<signal>]` string. Claimed-but-unevidenced
 * signals are downgraded to false — this kills the over-detection seen in the
 * first run (everything-AI → L4). A generic mention of "AI" is not enough.
 *
 * Honesty: the judge reports SIGNALS, never a Kavcic level — the level stays
 * Lyse's own `computeGovernanceMaturityLevel` mapping, so the #72 correlation
 * remains an independent external-validity test (not Claude reproducing the
 * Kavcic rubric). §0ter circularity reduced to "did Claude find concrete
 * evidence of this affordance"; the external anchor remains Kavcic (#72).
 */

export interface MaturityJudgeInput {
  repoName: string;
  /** AI-relevant context (concatenated snippets / docs) gathered upstream. */
  aiContext: string;
}

export interface MaturityJudgement {
  signals: GovernanceSignals;
  confidence: number; // 0–1
  /** Cited evidence per grounded (true) signal. */
  evidence: Record<string, string>;
}

export interface MaturityJudgeOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

const SIGNAL_KEYS = [
  "hasReservedAiTokens",
  "hasMarkerComponent",
  "hasInteractionAffordance",
  "hasGovernanceAffordance",
] as const;

function buildPrompt(input: MaturityJudgeInput): string {
  return [
    "You are auditing a design system's AI-governance affordances. Read the AI-relevant",
    "context and report which affordances are present. Do NOT assign an overall score or level.",
    "",
    `Design system: ${input.repoName}`,
    "Context extracted from the repository:",
    "```",
    input.aiContext.slice(0, 40_000),
    "```",
    "",
    "Signals (answer present/absent):",
    "  hasReservedAiTokens — design tokens / color roles specifically for AI-generated content.",
    "  hasMarkerComponent — a dedicated component/label/badge/avatar marking content as AI-generated.",
    "  hasInteractionAffordance — AI interaction patterns: loading/streaming/error states, feedback controls, or live regions for AI output.",
    "  hasGovernanceAffordance — AI governance: disclaimers, explainability, human-control/override, or a responsible-AI rubric.",
    "",
    "STRICT GROUNDING — default every signal to false. Mark a signal true ONLY if you can quote a",
    "concrete, specific instance from the context (an exact token name, component name, attribute, or",
    "doc heading). A generic mention of 'AI' is NOT sufficient. For EVERY signal you mark true you MUST",
    "provide that exact quote in `evidence`, keyed by the signal name. Unevidenced signals will be discarded.",
    "",
    "Output ONLY JSON:",
    '{ "hasReservedAiTokens": <bool>, "hasMarkerComponent": <bool>, "hasInteractionAffordance": <bool>, "hasGovernanceAffordance": <bool>, "confidence": <0-1>, "evidence": { "<signalName>": "<exact quote from context>" } }',
  ].join("\n");
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Returns validated, evidence-grounded governance signals, or null on a
 * structural failure (connector error/empty, parse error, missing/non-boolean
 * signal, non-numeric confidence). A true signal lacking concrete evidence is
 * downgraded to false rather than rejecting the whole judgement. Fail-safe: the
 * caller keeps the deterministic signals when this returns null.
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

  for (const k of SIGNAL_KEYS) {
    if (typeof o[k] !== "boolean") return null;
  }
  const confidence = o["confidence"];
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;

  const rawEvidence =
    typeof o["evidence"] === "object" && o["evidence"] !== null
      ? (o["evidence"] as Record<string, unknown>)
      : {};

  const signals: GovernanceSignals = {
    hasReservedAiTokens: false,
    hasMarkerComponent: false,
    hasInteractionAffordance: false,
    hasGovernanceAffordance: false,
  };
  const evidence: Record<string, string> = {};

  for (const k of SIGNAL_KEYS) {
    if (o[k] !== true) continue;
    const ev = rawEvidence[k];
    // Grounding: a true signal survives only with concrete, non-empty evidence.
    if (typeof ev === "string" && ev.trim() !== "") {
      signals[k] = true;
      evidence[k] = ev;
    }
  }

  return { signals, confidence: clamp01(confidence), evidence };
}
