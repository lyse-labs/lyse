/**
 * Early-adopter grace ramp for the AI-governance axis (#89 / ADR-0018).
 *
 * The ai-governance axis activates the moment a design system ships any AI
 * surface — but a *nascent* AI surface (one `AIBadge`) then takes the full
 * weight of ~10 governance affordances it hasn't built yet, cratering an
 * otherwise-healthy score (~−20 pts). That punishes teams for *starting* to do
 * AI governance, which is the opposite of the intent.
 *
 * The grace ramp scales the ai-governance contribution by how mature the AI
 * surface is: `factor = min(1, aiMarkerCount / window)`. At 1 AI marker the
 * axis weighs `1/window`; at `window`+ markers it weighs fully. Findings are
 * still *reported* — only their score contribution ramps in. Window is
 * configurable (`scoring.aiGovernanceGraceWindow`); default 5.
 */
export const DEFAULT_AI_GOVERNANCE_GRACE_WINDOW = 5;

/** Sub-axis id prefix for the graced axis. */
export const AI_GOVERNANCE_PREFIX = "ai-governance.";

/**
 * Returns the grace factor in [0, 1] for an AI surface of `aiMarkerCount`
 * markers. 0 markers → 0 (no AI surface → no governance penalty); ≥ window
 * markers → 1 (full weight). A window ≤ 1 disables the ramp (factor 1 for any
 * present surface).
 */
export function aiGovernanceGraceFactor(
  aiMarkerCount: number,
  window: number = DEFAULT_AI_GOVERNANCE_GRACE_WINDOW,
): number {
  if (aiMarkerCount <= 0) return 0;
  const w = Math.max(1, Math.floor(window));
  return Math.min(1, aiMarkerCount / w);
}
