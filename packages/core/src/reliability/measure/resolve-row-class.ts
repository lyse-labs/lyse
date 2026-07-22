import type { Resolver } from "../../graph/resolve/index.js";
import type { ResolveClass } from "../../graph/resolve/types.js";
import type { TokenAxis } from "../../graph/types.js";

// tokens/no-hardcoded-gradient is intentionally omitted: gradients have no
// single-value TokenAxis, so they never bucket to a resolvable class.
const RULE_AXIS: Record<string, TokenAxis> = {
  "tokens/no-hardcoded-color": "colors",
  "tokens/no-hardcoded-spacing": "spacing",
  "tokens/no-hardcoded-border-radius": "radii",
  "tokens/no-hardcoded-border-width": "borderWidth",
  "tokens/no-hardcoded-opacity": "opacity",
  "tokens/no-hardcoded-z-index": "zIndex",
  "tokens/no-hardcoded-media-query": "breakpoints",
  "tokens/no-hardcoded-shadow": "shadows",
  "tokens/no-hardcoded-typography": "typography",
  "tokens/no-hardcoded-motion": "motion",
};

export function axisForRuleId(ruleId: string): TokenAxis | null {
  return RULE_AXIS[ruleId] ?? null;
}

export function resolveRowClass(literal: string, axis: TokenAxis, resolver: Resolver): ResolveClass {
  return resolver.resolve(axis, literal).class;
}
