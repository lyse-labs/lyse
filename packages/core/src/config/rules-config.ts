import type { LyseConfig } from "../types.js";

/**
 * Rule ids referenced in `config.rules` that are not in the known registry.
 * Returned sorted for deterministic error messages. Catching these at audit
 * start turns a typo'd / renamed rule id from a silent no-op into a hard error.
 */
export function findUnknownRuleIds(
  config: LyseConfig,
  knownRuleIds: ReadonlySet<string>,
): string[] {
  const rules = config.rules;
  if (!rules) return [];
  return Object.keys(rules)
    .filter((id) => !knownRuleIds.has(id))
    .sort();
}

/**
 * Rule ids the config disables — `"off"` literal or `{ severity: "off" }`.
 * A disabled rule does not run and contributes no findings or opportunities.
 */
export function disabledRuleIds(config: LyseConfig): Set<string> {
  const out = new Set<string>();
  const rules = config.rules;
  if (!rules) return out;
  for (const [id, entry] of Object.entries(rules)) {
    if (entry === "off" || (typeof entry === "object" && entry.severity === "off")) {
      out.add(id);
    }
  }
  return out;
}
