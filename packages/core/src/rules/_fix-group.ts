import type { FixGroup, RuleId } from "../types.js";

/**
 * Builds a drift-class group from a drifted value and its candidate tokens.
 * `to` is set only when exactly one candidate exists — never guess between
 * multiple tokens. Returns undefined when there is no value to group on.
 */
export function makeFixGroup(
  ruleId: RuleId,
  from: string,
  candidates: readonly string[] | undefined,
): FixGroup | undefined {
  if (!from) return undefined;
  const to = candidates && candidates.length === 1 ? candidates[0] : undefined;
  return { key: `${ruleId}::${from}`, from, ...(to !== undefined && { to }) };
}
