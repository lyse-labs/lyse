import type { AxisName, AxisScore, Finding, GradeResult, PerRuleOpportunity } from "./types.js";
import { computeGrade } from "./reliability/grade.js";
import { SCORING_V2_LEGACY, SCORING_V3 } from "./reliability/score/version-pin.js";
import { scoreV3 } from "./scorer-v3.js";
import { scoreFromFindings } from "./scorer-v2-legacy.js";

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

// ---------------------------------------------------------------------------
// scoreAudit — dispatcher over the v2 (legacy) and v3 scoring formulas.
//
// DEFAULT_SCORE_MODEL stays "v2": a plain `lyse audit` must keep producing
// byte-identical output until a later task flips the default. v3 is opt-in
// via --score-model / LYSE_SCORE_MODEL / .lyse.yaml `scoring.model`.
// ---------------------------------------------------------------------------

export type ScoreModel = "v2" | "v3";

export const DEFAULT_SCORE_MODEL: ScoreModel = "v2";

export interface AuditScoreBundle {
  schemaVersion: 2 | 3;
  scoringVersion: string;
  finalScore: number | "N/A";
  tier: MaturityTier | "N/A";
  grade: GradeResult;
  axes: AxisScore[];
}

/**
 * Resolve which scoring model to run for this audit. Precedence: explicit
 * CLI flag > env var > config file > `DEFAULT_SCORE_MODEL`. Throws on any
 * resolved value outside `["v2", "v3"]` so a typo in .lyse.yaml or
 * LYSE_SCORE_MODEL fails loudly instead of silently falling back.
 */
export function resolveScoreModel(sources: {
  flag?: string;
  env?: string;
  config?: string;
}): ScoreModel {
  const resolved = sources.flag ?? sources.env ?? sources.config ?? DEFAULT_SCORE_MODEL;
  if (resolved !== "v2" && resolved !== "v3") {
    throw new Error(`Invalid scoring model "${resolved}" — expected "v2" or "v3".`);
  }
  return resolved;
}

/**
 * Score an audit under the given model, returning a version-stamped bundle
 * ready to spread into `AuditResult`. v2 is the legacy severity-weighted
 * scorer (scorer-v2-legacy.ts); v3 is the clean-rate-of-opportunity scorer
 * (scorer-v3.ts). The two formulas are NOT comparable — schemaVersion and
 * scoringVersion travel together so consumers can tell which ran.
 */
export function scoreAudit(
  model: ScoreModel,
  run: {
    findings: Finding[];
    opportunitiesByAxis: Record<AxisName, number>;
    perRuleOpportunities: PerRuleOpportunity[];
  },
  opts: { minSampleSize?: number; aiGovernanceGrace?: number } = {},
): AuditScoreBundle {
  if (model === "v2") {
    const r = scoreFromFindings(
      run.findings,
      run.opportunitiesByAxis,
      opts.aiGovernanceGrace !== undefined ? { aiGovernanceGrace: opts.aiGovernanceGrace } : {},
    );
    return {
      schemaVersion: 2,
      scoringVersion: SCORING_V2_LEGACY,
      finalScore: r.finalScore,
      tier: r.tier,
      grade: computeGrade(r.finalScore, r.autoFail),
      axes: r.axes,
    };
  }

  const r = scoreV3(
    run.findings,
    run.perRuleOpportunities,
    opts.minSampleSize !== undefined ? { minSampleSize: opts.minSampleSize } : {},
  );
  return {
    schemaVersion: 3,
    scoringVersion: SCORING_V3,
    finalScore: r.finalScore,
    tier: r.tier,
    grade: computeGrade(r.finalScore),
    axes: r.axes,
  };
}
