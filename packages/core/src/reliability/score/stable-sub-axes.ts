import type { SubAxisRecord } from "../types.js";

export interface StableSubAxesOptions {
  /** True when the LLM precision filter ran for this audit (meta.layer4.filterRan). */
  filterRan: boolean;
}

/**
 * The set of sub-axis ids whose findings count toward the trusted score.
 * A sub-axis qualifies if it is a calibrated stable contributor, OR (when the
 * LLM precision filter ran this audit) it is a filter-gated contributor.
 */
export function resolveStableSubAxes(
  subAxes: readonly SubAxisRecord[],
  opts: StableSubAxesOptions,
): Set<string> {
  const ids = new Set<string>();
  for (const s of subAxes) {
    const baseStable = s.status === "stable" && s.contributesToScore;
    const filterGated = opts.filterRan && s.contributesToScoreWhenFiltered === true;
    if (baseStable || filterGated) ids.add(s.id);
  }
  return ids;
}
