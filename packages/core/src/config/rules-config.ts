import type { Finding, LyseConfig, Severity } from "../types.js";

// Rule ids retired in the ai-governance prune (sub-project D). A `.lyse.yaml`
// that still references one is tolerated: it is NOT a hard error (unlike a
// genuine typo), it is warned-and-ignored. Kept as a const so the audit
// pipeline can surface a precise retirement warning.
export const RETIRED_RULE_IDS: ReadonlySet<string> = new Set([
  "ai-governance/explainability-affordance",
  "ai-governance/human-control-affordances",
  "ai-governance/ai-marker-anti-patterns",
  "ai-governance/disclaimer-present",
  "ai-governance/value-gate-doc-present",
  "ai-governance/ai-tokens-reserved",
  "ai-governance/ai-token-requires-marker",
]);

/**
 * Rule ids referenced in `config.rules` that are not in the known registry.
 * Returned sorted for deterministic error messages. Catching these at audit
 * start turns a typo'd / renamed rule id from a silent no-op into a hard error.
 * Retired ids are excluded — they degrade gracefully via {@link findRetiredRuleIds}.
 */
export function findUnknownRuleIds(
  config: LyseConfig,
  knownRuleIds: ReadonlySet<string>,
): string[] {
  const rules = config.rules;
  if (!rules) return [];
  return Object.keys(rules)
    .filter((id) => !knownRuleIds.has(id) && !RETIRED_RULE_IDS.has(id))
    .sort();
}

/**
 * Retired rule ids referenced in `config.rules`. The audit pipeline warns on
 * these (rather than erroring) so a stale `.lyse.yaml` keeps working.
 */
export function findRetiredRuleIds(config: LyseConfig): string[] {
  const rules = config.rules;
  if (!rules) return [];
  return Object.keys(rules)
    .filter((id) => RETIRED_RULE_IDS.has(id))
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

/**
 * Map of rule id → overridden display severity (a real level only — `off` is
 * handled upstream by {@link disabledRuleIds}, never here).
 */
function severityOverrideMap(config: LyseConfig): Map<string, Severity> {
  const out = new Map<string, Severity>();
  const rules = config.rules;
  if (!rules) return out;
  for (const [id, entry] of Object.entries(rules)) {
    if (typeof entry === "object" && entry.severity && entry.severity !== "off") {
      out.set(id, entry.severity);
    }
  }
  return out;
}

/**
 * Applies `rules.<id>.severity` overrides to findings' **display** severity.
 *
 * Returns a new array with overridden findings shallow-cloned; the input is
 * never mutated. By contract this runs AFTER scoring, so a config severity
 * override changes what reporters show but never the Health Score — keeping
 * the determinism contract ("severity does not change the score") intact.
 * Returns the input reference unchanged when there is nothing to override.
 */
export function applySeverityOverrides(findings: Finding[], config: LyseConfig): Finding[] {
  const overrides = severityOverrideMap(config);
  if (overrides.size === 0) return findings;
  let changed = false;
  const out = findings.map((f) => {
    const next = overrides.get(f.ruleId);
    if (next && next !== f.severity) {
      changed = true;
      return { ...f, severity: next };
    }
    return f;
  });
  return changed ? out : findings;
}
