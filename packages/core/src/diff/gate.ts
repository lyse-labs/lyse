import type { Baseline } from "./baseline.js";
import type { AxisName, Finding } from "../types.js";

export interface GateInput {
  newFindings: readonly Finding[];
  currentScores: Partial<Record<AxisName, number>>;
  baseline: Pick<Baseline, "scores">;
  scoreContributingRuleIds: ReadonlySet<string>;
  scoreTolerance?: number;
}

export interface GateResult {
  fail: boolean;
  reasons: string[];
}

export function evaluateGate(input: GateInput): GateResult {
  const tol = input.scoreTolerance ?? 0;
  const reasons: string[] = [];

  const scored = input.newFindings.filter((f) => input.scoreContributingRuleIds.has(String(f.ruleId)));
  if (scored.length > 0) {
    reasons.push(`${scored.length} new finding(s) on score-contributing rules`);
  }

  for (const axis of Object.keys(input.baseline.scores) as AxisName[]) {
    const base = input.baseline.scores[axis];
    const cur = input.currentScores[axis];
    if (typeof base === "number" && typeof cur === "number" && cur < base - tol) {
      reasons.push(`${axis} score regressed: ${cur} < ${base} (tolerance ${tol})`);
    }
  }

  return { fail: reasons.length > 0, reasons };
}
