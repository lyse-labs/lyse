import type { Finding, RuleContext } from "../types.js";
import { fixHardcodedColor } from "./tokens-color.js";
import { fixHardcodedSpacing } from "./tokens-spacing.js";
import { fixShadowNative } from "./shadow-native.js";
import { fixWrapAiToken } from "./ai-token-requires-marker.js";
import { ruleMap } from "../rules/registry.js";

export interface CodemodInput {
  /** The full original source code. */
  source: string;
  /** Path of the file (used for diff headers). */
  path: string;
  /** The finding to fix. */
  finding: Finding;
  /** Project context (tokens, components, etc.) — needed for reverse-lookup. */
  ctx: RuleContext;
}

export interface CodemodResult {
  /** Unified diff text, or null if no fix can be produced. */
  patch: string | null;
  /** Confidence 0-1 (1 = deterministic single-candidate replacement). */
  confidence: number;
  /** Alternative patches (used when there are multiple candidates and we picked one). */
  alternatives: Array<{ patch: string; rationale: string }>;
  /** When patch is null, why no fix is available. */
  rationale: string | null;
  rule_id: string;
  schema_version: "1.0.0";
}

const NO_FIX = (ruleId: string, rationale: string): CodemodResult => ({
  patch: null,
  confidence: 0,
  alternatives: [],
  rationale,
  rule_id: ruleId,
  schema_version: "1.0.0",
});

export async function applyCodemod(input: CodemodInput): Promise<CodemodResult> {
  // Direct path: the 3 hand-written codemods in this directory.
  switch (input.finding.ruleId) {
    case "tokens/no-hardcoded-color":
      return fixHardcodedColor(input);
    case "tokens/no-hardcoded-spacing":
      return fixHardcodedSpacing(input);
    case "components/no-native-shadows":
      return fixShadowNative(input);
    case "ai-governance/ai-token-requires-marker":
      return fixWrapAiToken(input);
    case "a11y/essentials":
      return NO_FIX(
        input.finding.ruleId,
        "Accessibility fixes require designer judgment (alt text content, aria-labels). Not auto-fixable in V0.1.0.",
      );
    case "stories/coverage":
      return NO_FIX(
        input.finding.ruleId,
        "Creating a Storybook story file requires choices about variants, args, and decorators. Not auto-fixable in V0.1.0.",
      );
  }
  // Sprint-1 rules expose their codemods via Rule.applyCodemod on the registry
  // (typography, radii, motion-*, opacity, z-index, border-width, naming-*).
  // The shape differs from this module's CodemodResult — the registry returns
  // `{ diff, importsAdded, confidence, warnings? }` while MCP suggest-fix wants
  // `{ patch, alternatives, rationale, ... }`. Adapting cross-shapes is
  // tracked as a follow-up — so this module's `applyCodemod` does not yet wire
  // those registry codemods into MCP `suggest_fix`; it returns NO_FIX for them
  // below. (`share.ts` reads `rule.applyCodemod` only to flag a finding as
  // fixable.)
  const rule = ruleMap.get(input.finding.ruleId);
  if (rule?.applyCodemod) {
    return NO_FIX(
      input.finding.ruleId,
      `Codemod available via the rule's \`applyCodemod\` but not yet adapted for MCP suggest-fix. Tracked as follow-up.`,
    );
  }
  return NO_FIX(input.finding.ruleId, `Unknown rule: ${input.finding.ruleId} (no codemod registered)`);
}
