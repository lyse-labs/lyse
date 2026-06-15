import type { Resource } from "@modelcontextprotocol/sdk/types.js";
import { RULE_MANIFEST_OBJECT, findRuleMeta } from "../rules/manifest.js";

/**
 * MCP resources expose Lyse's rule contract so an agent can *read* the design
 * system rules (not just call the audit tools). All content is in-memory (the
 * bundled rule manifest) — no filesystem access.
 *
 *   lyse://rules            → the full rules manifest (every rule's metadata)
 *   lyse://rule/<ruleId>    → one rule's metadata (e.g. lyse://rule/tokens/no-hardcoded-color)
 */
const RULES_URI = "lyse://rules";
const RULE_URI_PREFIX = "lyse://rule/";

export function listResources(): Resource[] {
  const resources: Resource[] = [
    {
      uri: RULES_URI,
      name: "Lyse rules manifest",
      description: `All ${RULE_MANIFEST_OBJECT.rules.length} Lyse rules with axis, severity, descriptions, rationale, and examples.`,
      mimeType: "application/json",
    },
  ];
  for (const rule of RULE_MANIFEST_OBJECT.rules) {
    resources.push({
      uri: `${RULE_URI_PREFIX}${rule.id}`,
      name: rule.id,
      description: rule.shortDescription,
      mimeType: "application/json",
    });
  }
  return resources;
}

export interface ResourceContents {
  uri: string;
  mimeType: string;
  text: string;
}

/** Returns the resource contents for a uri, or null when the uri is unknown. */
export function readResource(uri: string): ResourceContents[] | null {
  if (uri === RULES_URI) {
    return [{ uri, mimeType: "application/json", text: JSON.stringify(RULE_MANIFEST_OBJECT, null, 2) }];
  }
  if (uri.startsWith(RULE_URI_PREFIX)) {
    const ruleId = uri.slice(RULE_URI_PREFIX.length);
    const meta = findRuleMeta(ruleId);
    if (!meta) return null;
    return [{ uri, mimeType: "application/json", text: JSON.stringify(meta, null, 2) }];
  }
  return null;
}
