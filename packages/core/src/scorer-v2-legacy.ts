import { scoreTotier, type MaturityTier } from "./scorer.js";
import type { AxisName, AxisScore, Finding, Severity } from "./types.js";

/**
 * Scoring formula v2 — Phase 4.1 (bug #102 mechanical fix).
 *
 * Replaces the v1 axis-weighted formula (tokens=33/a11y=28/components=22/...)
 * with a defensible per-axis composite of (a) a rate term and (b) a log-scaled
 * absolute cap on raw violation volume:
 *
 *     rateScore   = 100 * (1 - weightedFindings / opportunities)
 *     absoluteCap = 100 - K * log10(1 + sevPenalty)
 *     axisScore   = max(0, min(rateScore, absoluteCap))
 *
 * Where `weightedFindings = 4*errorCount + 2*warningCount + 1*infoCount`
 * (severity weights match `reliability/score/weight.ts`). Final score is the
 * equal-weight average of axisScore across active axes (opportunities > 0)
 * — explicitly NOT a fancy per-axis weighting, which is indefensible publicly.
 *
 * K was fit via least-squares on the 8-repo calibration corpus described in
 * `docs/architecture/calibration.md`. The fitted optimum is K=0 (rounded to 0.1 from
 * 0.048): on this corpus the rate term is already the binding constraint,
 * and any positive cap pushes scores further below expert labels. Pinning
 * K=0 makes the cap a no-op (cap=100 always) — kept as a structural
 * placeholder for the v2 formula so the audit JSON shape and downstream
 * consumers stay stable.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = { error: 4, warning: 2, info: 1 };

// SCORING_K calibrated 2026-05-23 via least-squares.
// LOO MAE: 10.36 pts (target <= 8). See `docs/architecture/calibration.md`.
export const SCORING_K = 0;

// Auto-fail cap (#87): when >=2 axes score 0, the final score is capped into
// the Fail band so the number, tier, and grade can never contradict each other.
const FAIL_CAP = 39;

const AXIS_ORDER: AxisName[] = ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"];

export interface AxisFindings {
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface AxisScoreV2 extends AxisScore {
  /** Raw 100*(1 - weightedFindings/opportunities), pre-cap. "N/A" when opportunities=0. */
  rateScore: number | "N/A";
  /** 100 - K*log10(1 + sevPenalty). "N/A" when opportunities=0. */
  absoluteCap: number | "N/A";
  /** Sum of severity-weighted findings on this axis. */
  sevPenalty: number;
  /** Alias of sevPenalty exposed for clarity in audit artifacts. */
  weightedFindings: number;
}

export interface ScoreResult {
  finalScore: number | "N/A";
  tier: MaturityTier | "N/A";
  axes: AxisScoreV2[];
  /** Surface K so consumers can audit the formula. */
  scoringK: number;
  /** Present when >=2 axes scored 0 and the score was capped into the Fail band. */
  autoFail?: { reasons: string[] };
}

function totalFindings(f: AxisFindings): number {
  return f.errorCount + f.warningCount + f.infoCount;
}

function weighted(f: AxisFindings): number {
  return (
    SEVERITY_WEIGHT.error * f.errorCount +
    SEVERITY_WEIGHT.warning * f.warningCount +
    SEVERITY_WEIGHT.info * f.infoCount
  );
}

export interface ScoreOptions {
  /**
   * Early-adopter grace factor in [0, 1] for the ai-governance axis (#89 /
   * ADR-0018). The axis score is blended toward 100 (neutral) by (1 - factor),
   * so a nascent AI surface barely dents the mean. 1 (default) is inert.
   */
  aiGovernanceGrace?: number;
}

export function score(
  findingsByAxis: Record<AxisName, AxisFindings>,
  opportunitiesByAxis: Record<AxisName, number>,
  opts: ScoreOptions = {},
): ScoreResult {
  const axes: AxisScoreV2[] = [];
  const activeAxisScores: number[] = [];

  for (const axis of AXIS_ORDER) {
    const opp = opportunitiesByAxis[axis] ?? 0;
    const fnd = findingsByAxis[axis] ?? { errorCount: 0, warningCount: 0, infoCount: 0 };
    const totalFnd = totalFindings(fnd);
    const sevPenalty = weighted(fnd);

    if (opp === 0) {
      axes.push({
        axis,
        score: "N/A",
        findings: totalFnd,
        opportunities: 0,
        rateScore: "N/A",
        absoluteCap: "N/A",
        sevPenalty,
        weightedFindings: sevPenalty,
      });
      continue;
    }

    const rateRaw = 100 * (1 - sevPenalty / opp);
    const capRaw = 100 - SCORING_K * Math.log10(1 + sevPenalty);
    let axisRaw = Math.max(0, Math.min(rateRaw, capRaw));
    // Early-adopter grace (#89): a nascent AI surface should not take the full
    // weight of governance affordances it hasn't built yet — blend toward 100.
    if (axis === "ai-governance" && opts.aiGovernanceGrace !== undefined && opts.aiGovernanceGrace < 1) {
      const g = Math.max(0, opts.aiGovernanceGrace);
      axisRaw = g * axisRaw + (1 - g) * 100;
    }
    const axisScore = Math.round(axisRaw);

    axes.push({
      axis,
      score: axisScore,
      findings: totalFnd,
      opportunities: opp,
      rateScore: Math.round(rateRaw),
      absoluteCap: Math.round(capRaw),
      sevPenalty,
      weightedFindings: sevPenalty,
    });
    activeAxisScores.push(axisScore);
  }

  if (activeAxisScores.length === 0) {
    return { finalScore: "N/A", tier: "N/A", axes, scoringK: SCORING_K };
  }

  const avg = activeAxisScores.reduce((s, x) => s + x, 0) / activeAxisScores.length;
  let finalScore = Math.round(avg);

  // Auto-fail (#87): >=2 axes scored 0 caps the score into the Fail band, so
  // the number, tier, and grade can never contradict each other.
  const zeroAxes = axes
    .filter((a) => a.score === 0)
    .map((a) => a.axis)
    .sort((a, b) => a.localeCompare(b));
  let autoFail: { reasons: string[] } | undefined;
  if (zeroAxes.length >= 2) {
    finalScore = Math.min(finalScore, FAIL_CAP);
    autoFail = { reasons: [`${zeroAxes.length} axes scored 0: ${zeroAxes.join(", ")}`] };
  }

  return {
    finalScore,
    tier: scoreTotier(finalScore),
    axes,
    scoringK: SCORING_K,
    ...(autoFail ? { autoFail } : {}),
  };
}

/**
 * Convenience adapter — aggregates a flat `Finding[]` list into per-axis
 * severity buckets and calls `score(...)`. Used by the audit pipeline so it
 * does not need to compute the aggregation itself.
 */
export function scoreFromFindings(
  findings: Finding[],
  opportunitiesByAxis: Record<AxisName, number>,
  opts: ScoreOptions = {},
): ScoreResult {
  const buckets: Record<AxisName, AxisFindings> = {
    tokens: { errorCount: 0, warningCount: 0, infoCount: 0 },
    a11y: { errorCount: 0, warningCount: 0, infoCount: 0 },
    components: { errorCount: 0, warningCount: 0, infoCount: 0 },
    stories: { errorCount: 0, warningCount: 0, infoCount: 0 },
    "ai-surface": { errorCount: 0, warningCount: 0, infoCount: 0 },
    "ai-governance": { errorCount: 0, warningCount: 0, infoCount: 0 },
  };
  for (const f of findings) {
    const bucket = buckets[f.axis];
    if (!bucket) continue;
    if (f.severity === "error") bucket.errorCount++;
    else if (f.severity === "warning") bucket.warningCount++;
    else bucket.infoCount++;
  }
  return score(buckets, opportunitiesByAxis, opts);
}
