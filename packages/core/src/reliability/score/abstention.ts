/**
 * Why an axis abstained, in a sentence the user can act on.
 *
 * `tokens N/A n=1` is true and useless. It does not say whether the repository
 * has no tokens, whether Lyse could not read them, or whether the checks that
 * would have counted never ran — and those call for three different responses.
 * On every design system in the pinned corpus the tokens axis abstains for the
 * last reason: its only volume-producing scored rules read DTCG `*.tokens.json`
 * files, and essentially no shipped design system publishes one. A user cannot
 * possibly infer that from `N/A`.
 *
 * Deliberately generic. The scorer knows how many opportunities were counted,
 * the floor, and which extractors were degraded — it does not know about DTCG,
 * and teaching it would put rule-specific knowledge in the one place that must
 * stay rule-agnostic. What it can say is which of the three situations applies,
 * which is what tells the user where to look.
 */
export interface AbstentionInput {
  opportunities: number;
  minSampleSize: number;
  /** Extractors that did not finish `ok`, whose rules were dropped from scoring. */
  blockedExtractors: readonly string[];
}

export function abstentionReason(input: AbstentionInput): string | null {
  if (input.opportunities >= input.minSampleSize) return null;

  const blocked =
    input.blockedExtractors.length > 0
      ? ` The ${input.blockedExtractors.join(" and ")} extractor${
          input.blockedExtractors.length === 1 ? "" : "s"
        } did not complete, so the checks that read what it produces were excluded from the score.`
      : "";

  if (input.opportunities === 0) {
    return (
      "not scored: no scored check was able to measure anything on this axis. " +
      "That is not the same as finding nothing wrong — nothing was examined." +
      blocked
    );
  }

  return (
    `not scored: ${input.opportunities} thing${input.opportunities === 1 ? "" : "s"} measured, ` +
    `and ${input.minSampleSize} are needed before a ratio means anything.` +
    blocked
  );
}
