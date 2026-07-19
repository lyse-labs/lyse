import type { AxisName } from "./types.js";

const AXIS_ORDER: AxisName[] = ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"];

export type MaturityTier =
  | "Foundational"
  | "Managed"
  | "Defined"
  | "Quantitative"
  | "Autonomous";

/**
 * Map a numeric score (or "N/A") to a CMMI-style maturity tier.
 * Boundaries: 0-19 Foundational, 20-39 Managed, 40-59 Defined,
 * 60-79 Quantitative, 80-100 Autonomous.
 */
export function scoreTotier(score: number | "N/A"): MaturityTier | "N/A" {
  if (score === "N/A") return "N/A";
  if (score < 20) return "Foundational";
  if (score < 40) return "Managed";
  if (score < 60) return "Defined";
  if (score < 80) return "Quantitative";
  return "Autonomous";
}

export { score, scoreFromFindings, SCORING_K } from "./scorer-v2-legacy.js";
export type { AxisFindings, AxisScoreV2, ScoreResult, ScoreOptions } from "./scorer-v2-legacy.js";
