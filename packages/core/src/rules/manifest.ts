import type { RuleMeta, RulesManifest } from "../types.js";
import { ruleObjects } from "./registry.js";
import { getRegisteredRuleMeta, toRuleMeta } from "./_rule-module.js";

export const RULES_VERSION = "0.1.0";

export const RULE_METADATA: RuleMeta[] = ruleObjects.map((rule) => {
  const meta = getRegisteredRuleMeta(rule.id);
  if (!meta) {
    throw new Error(
      `Rule "${rule.id}" is in the registry but has no registered metadata. ` +
        `Ensure its source file uses createLyseRule() with the full meta shape.`,
    );
  }
  return toRuleMeta(meta);
});

export const RULE_MANIFEST_OBJECT: RulesManifest = {
  schemaVersion: "1.0.0",
  rulesVersion: RULES_VERSION,
  rules: RULE_METADATA,
};

export function findRuleMeta(id: string): RuleMeta | undefined {
  return RULE_METADATA.find((r) => r.id === id);
}
