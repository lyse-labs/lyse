import type { AuditResult, AxisName, Finding } from "../../types.js";
import { stableRuleIds } from "../../reliability/score/stable-sub-axes.js";
import { SUB_AXES } from "../../reliability/catalogue/sub-axes.js";
import { rulesBlockedByDegradedExtraction } from "../../reliability/score/coverage.js";

/**
 * Which findings actually moved the Health Score.
 *
 * The ESLint-style footer used to partition on `Finding.confidence`, which is a
 * codemod-safety classification assigned *after* the score exists
 * (`runAudit` → `populateConfidence`) and which neither scorer reads. On vibe
 * that printed "1 stable findings · 107 experimental (not counted)" under a
 * score of 59 that 76 of those findings had produced.
 *
 * The scorer's own partition has two parts and both are on the result already:
 * a rule must be score-contributing and not blocked by a degraded extractor
 * (`scorer-v3.ts#counts`), and its axis must have escaped the min-N floor —
 * findings on an abstaining axis moved nothing, whatever their rule.
 */
export function countedFindingPredicate(result: AuditResult): (f: Finding) => boolean {
  const scoredRules = stableRuleIds(SUB_AXES, {
    filterRan: result.meta?.layer4?.filterRan ?? false,
  });
  const blocked = result.meta?.extraction
    ? rulesBlockedByDegradedExtraction(result.meta.extraction)
    : new Set<string>();
  const scoredAxes = new Set<AxisName>(
    result.axes.filter((a) => typeof a.score === "number").map((a) => a.axis),
  );
  return (f) => scoredAxes.has(f.axis) && scoredRules.has(f.ruleId) && !blocked.has(f.ruleId);
}

/**
 * The same number read off the axes instead of the findings: what each scored
 * axis reports having counted. Independent of the rule sets, so it is the
 * cross-check that keeps the ESLint footer and the JSON reporter from
 * contradicting each other on one run.
 */
export function countedFromAxes(result: AuditResult): number {
  return result.axes.reduce((n, a) => (typeof a.score === "number" ? n + a.findings : n), 0);
}
