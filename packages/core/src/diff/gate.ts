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
    if (typeof base !== "number") continue;
    const cur = input.currentScores[axis];
    if (typeof cur !== "number") {
      // Not scored is not a pass. `cli.ts` omits N/A axes from `currentScores`,
      // so an axis that fell under the minimum-sample guard reaches here as
      // `undefined` — and the old `typeof cur === "number"` guard let it
      // through while the headline score rose, because the average then ran
      // over fewer axes. Tolerance does not apply: this is a loss of coverage,
      // not a change in degree.
      reasons.push(`${axis} was scored ${base} at baseline and is no longer scored`);
      continue;
    }
    if (cur < base - tol) {
      reasons.push(`${axis} score regressed: ${cur} < ${base} (tolerance ${tol})`);
    }
  }

  return { fail: reasons.length > 0, reasons };
}
