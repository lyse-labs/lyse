/**
 * Scoring v3 (Scoring v3 project) — clean-rate-of-opportunity formula.
 * The default: stamped on `AuditResult` whenever `scoreAudit` runs in "v3"
 * mode, which is now `DEFAULT_SCORE_MODEL`.
 */
export const SCORING_V3 = "scoring-v3" as const;

/**
 * Explicit alias for the legacy v2 scorer's version stamp, stamped only when
 * `scoreAudit` runs in "v2" mode (`--score-model v2` / `LYSE_SCORE_MODEL=v2` /
 * `scoring.model: v2`) — kept reachable for one minor, then removed.
 */
export const SCORING_V2_LEGACY = "scoring-v1.1" as const;

/**
 * The scoring version a plain `lyse audit` stamps by default. Repointed from
 * `SCORING_V2_LEGACY` to `SCORING_V3` when the default model flipped to v3.
 */
export const CURRENT_SCORING_VERSION = SCORING_V3;
