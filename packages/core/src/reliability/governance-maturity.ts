/**
 * AI-Governance Maturity Level (Track #72 / Phase D) — a positive 0–5 maturity
 * signal mapped to Kavcic's published AI-readiness ladder. Reported alongside
 * the Health Score, NOT folded into it: the penalty-based score cannot measure
 * maturity (it would rank an AI-mature DS below a no-AI one). See
 * docs/superpowers/specs/2026-06-14-ai-governance-maturity-level-design.md.
 *
 * Deterministic tier covers L0–L4 by *presence* of affordances; L5 ("AI as
 * system infrastructure") is not statically detectable and is capped out here.
 * Presence ≠ adequacy — the LLM conformal layer refines this later.
 */

export interface GovernanceSignals {
  /** Reserved AI tokens (color/role) present — `detectReservedAiTokens`. */
  hasReservedAiTokens: boolean;
  /** A dedicated AI-marker component is shipped — `ai-marker-component-present`. */
  hasMarkerComponent: boolean;
  /** AI interaction affordances: loading/error states, feedback control, or live region. */
  hasInteractionAffordance: boolean;
  /** AI governance affordances: human-control + explainability + disclaimer, no anti-patterns. */
  hasGovernanceAffordance: boolean;
}

/** Kavcic-aligned maturity ladder labels, indexed by level (L0–L5). */
export const MATURITY_LABELS = [
  "no AI layer",
  "AI as decoration",
  "AI as a component",
  "AI as an interaction pattern",
  "AI as a governance layer",
  "AI as system infrastructure",
] as const;

/** Kavcic-aligned maturity level 0–4 (L5 not statically detectable). */
export function computeGovernanceMaturityLevel(s: GovernanceSignals): number {
  // L0 — no visible AI layer.
  if (!s.hasMarkerComponent && !s.hasReservedAiTokens) return 0;
  // L1 — AI as decoration: tokens present, but no marker component.
  if (!s.hasMarkerComponent) return 1;
  // From here a dedicated marker component exists (≥ L2). The ladder requires
  // each lower rung, so higher levels gate on the marker.
  if (s.hasInteractionAffordance && s.hasGovernanceAffordance) return 4;
  if (s.hasInteractionAffordance) return 3;
  return 2; // AI as a component.
}
