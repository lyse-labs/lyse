import type { AxisName, Finding, PerRuleOpportunity } from "./types.js";
import { scoreTotier, type MaturityTier } from "./scorer.js";

export const MIN_SAMPLE_SIZE = 30;

/**
 * A headline score is a claim about the design system as a whole. Averaging one
 * or two surviving axes and grading it "A" claims far more than was measured, so
 * below this floor the run abstains and only the per-axis numbers are published.
 */
export const MIN_SCORED_AXES = 3;

const AXIS_ORDER: AxisName[] = ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"];

export interface AxisScoreV3 {
  axis: AxisName;
  score: number | "N/A";
  findings: number;
  opportunities: number;
}

export interface ScoreV3Result {
  finalScore: number | "N/A";
  tier: MaturityTier | "N/A";
  axes: AxisScoreV3[];
}

export function scoreV3(
  findings: Finding[],
  perRuleOpportunities: PerRuleOpportunity[],
  opts: {
    minSampleSize?: number;
    scoreContributingRuleIds?: ReadonlySet<string>;
    degradedAxes?: ReadonlySet<AxisName>;
    minScoredAxes?: number;
  } = {},
): ScoreV3Result {
  const minN = Math.max(1, opts.minSampleSize ?? MIN_SAMPLE_SIZE);

  // A rule whose reliability is unmeasured may not move the score. Both sides of
  // the ratio are filtered: leaving an experimental rule's opportunities in the
  // denominator would dilute the penalty of the rules that do count.
  const scored = opts.scoreContributingRuleIds;
  const countedFindings = scored ? findings.filter((f) => scored.has(f.ruleId)) : findings;
  const countedOpportunities = scored
    ? perRuleOpportunities.filter((r) => scored.has(r.ruleId))
    : perRuleOpportunities;

  // findings count per ruleId (only rules that recorded opportunities contribute)
  const findingsByRule = new Map<string, number>();
  for (const f of countedFindings)
    findingsByRule.set(f.ruleId, (findingsByRule.get(f.ruleId) ?? 0) + 1);

  // per-axis: Σ opp, Σ max(0, opp − findings), raw Σ findings (for display)
  const cleanByAxis = new Map<AxisName, number>();
  const oppByAxis = new Map<AxisName, number>();
  const findByAxis = new Map<AxisName, number>();
  for (const r of countedOpportunities) {
    const fr = findingsByRule.get(r.ruleId) ?? 0;
    cleanByAxis.set(r.axis, (cleanByAxis.get(r.axis) ?? 0) + Math.max(0, r.opportunities - fr));
    oppByAxis.set(r.axis, (oppByAxis.get(r.axis) ?? 0) + r.opportunities);
    findByAxis.set(r.axis, (findByAxis.get(r.axis) ?? 0) + fr);
  }

  const axes: AxisScoreV3[] = [];
  const activated: number[] = [];
  for (const axis of AXIS_ORDER) {
    const opp = oppByAxis.get(axis) ?? 0;
    const fnd = findByAxis.get(axis) ?? 0;
    // Abstain when the evidence was never read: a ratio over a surface the
    // extractor failed on measures the extractor, not the design system.
    if (opp < minN || opts.degradedAxes?.has(axis) === true) {
      axes.push({ axis, score: "N/A", findings: fnd, opportunities: opp });
      continue;
    }
    const clean = cleanByAxis.get(axis) ?? 0;
    const s = clean > 0 ? Math.max(1, Math.round((100 * clean) / opp)) : 0;
    axes.push({ axis, score: s, findings: fnd, opportunities: opp });
    activated.push(s);
  }

  const minAxes = Math.max(1, opts.minScoredAxes ?? MIN_SCORED_AXES);
  if (activated.length < minAxes) return { finalScore: "N/A", tier: "N/A", axes };
  const finalScore = Math.round(activated.reduce((a, b) => a + b, 0) / activated.length);
  return { finalScore, tier: scoreTotier(finalScore), axes };
}
