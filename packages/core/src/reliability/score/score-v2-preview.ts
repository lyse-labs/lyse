import type { SubAxisRecord } from "../types.js";
import { resolveStableSubAxes, type StableSubAxesOptions } from "./stable-sub-axes.js";

/**
 * The score-v2 PREVIEW sub-axis set (#71).
 *
 * A strict superset of the trusted v1 set: every v1 contributor PLUS the
 * deterministic structural sub-axes flagged `contributesToScoreV2` — those whose
 * synthetic recall AND precision Wilson lower bounds both clear the 0.90 promotion
 * gate but which have not yet been promoted into the live (v1) trusted score.
 *
 * This set is READ-ONLY: it never feeds the trusted Health Score. `explain
 * --score` computes a preview score over it so the impact of promoting the moat
 * (the AI-governance + structural sub-axes) can be inspected before any v1 change.
 */
export function resolveScoreV2PreviewSubAxes(
  subAxes: readonly SubAxisRecord[],
  opts: StableSubAxesOptions,
): Set<string> {
  const ids = resolveStableSubAxes(subAxes, opts);
  for (const s of subAxes) {
    if (s.contributesToScoreV2 === true) ids.add(s.id);
  }
  return ids;
}
