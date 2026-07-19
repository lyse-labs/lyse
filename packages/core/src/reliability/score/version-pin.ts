export const CURRENT_SCORING_VERSION = "scoring-v1.1" as const;

/**
 * Scoring v3 (Scoring v3 project) — clean-rate-of-opportunity formula.
 * Not yet the default; stamped on `AuditResult` only when `scoreAudit` runs
 * in "v3" mode (`--score-model v3` / `LYSE_SCORE_MODEL=v3` / `scoring.model: v3`).
 */
export const SCORING_V3 = "scoring-v3" as const;

/**
 * Explicit alias for the legacy v2 scorer's version stamp, so `scoreAudit`'s
 * "v2" branch doesn't have to reach for `CURRENT_SCORING_VERSION` (which will
 * be repointed at `SCORING_V3` once v3 becomes the default — a later task).
 */
export const SCORING_V2_LEGACY = "scoring-v1.1" as const;
