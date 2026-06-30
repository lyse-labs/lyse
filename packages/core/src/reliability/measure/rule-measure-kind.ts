export type MeasureKind = "structural" | "detection" | "render-only";

// Why explicit (not inferred): a reviewer must be able to audit which rules
// get deterministic auto-labelling vs LLM-judging vs no measurement.
export const RULE_MEASURE_KIND: Record<string, MeasureKind> = {
  // tokens — detection (flag a hardcoded value/pattern in source)
  "tokens/no-hardcoded-color": "detection",
  "tokens/no-hardcoded-spacing": "detection",
  "tokens/no-hardcoded-gradient": "detection",
  "tokens/no-hardcoded-media-query": "detection",
  "tokens/container-query": "detection",
  "tokens/no-hardcoded-z-index": "detection",
  "tokens/no-hardcoded-opacity": "detection",
  "tokens/no-hardcoded-border-radius": "detection",
  "tokens/no-hardcoded-border-width": "detection",
  "tokens/no-hardcoded-motion": "detection",
  "tokens/no-hardcoded-shadow": "detection",
  "tokens/no-hardcoded-typography": "detection",
  "tokens/deprecated-token-usage": "detection",
  // tokens — structural (absence/structure check on token files)
  "tokens/dtcg-conformance": "structural",
  "tokens/description-coverage": "structural",
  "tokens/theme-modes-present": "structural",
  "tokens/css-custom-property-export": "structural",
  "tokens/responsive-breakpoints": "structural",
  // tokens — render-only
  "tokens/rendered-token-fidelity": "render-only",

  // components — detection (flag a value/pattern in component source)
  "components/no-native-shadows": "detection",
  "components/no-icon-fonts": "detection",
  "components/svg-viewbox": "detection",
  "components/icon-decorative-aria": "detection",
  "components/contracts-strictness": "detection",
  "components/standardized-variant-props": "detection",
  "components/no-arbitrary-tailwind": "detection",
  "components/no-style-escape-hatch": "detection",
  // components — structural (absence/presence check)
  "components/doc-comments": "structural",

  // naming — structural (presence/pattern on file names and exports)
  "naming/component-pascalcase": "structural",
  "naming/hook-prefix": "structural",

  // a11y — detection (flag a pattern in static source)
  "a11y/essentials": "detection",
  "a11y/contrast-tokens": "detection",
  "a11y/interactive-role-name": "detection",
  "a11y/focus-visible": "detection",
  "a11y/semantic-html": "detection",
  "a11y/forced-colors": "detection",
  "a11y/html-lang": "detection",
  "a11y/inclusive-language": "detection",
  "a11y/prefers-reduced-motion": "detection",
  // a11y — render-only
  "a11y/runtime-axe": "render-only",

  // stories — structural (presence check)
  "stories/coverage": "structural",
  "stories/props-documented": "structural",
  "stories/usage-examples": "structural",

  // ai-surface — structural (presence/validity of AI-surface artifacts)
  "ai-surface/agents-md-quality": "structural",
  "ai-surface/component-manifest-json": "structural",
  "ai-surface/component-manifest-completeness": "structural",
  "ai-surface/ds-index-exported": "structural",
  "ai-surface/mcp-config-present": "structural",
  "ai-surface/llms-txt-structure": "structural",
  "ai-surface/shadcn-registry-valid": "structural",
  "ai-surface/agent-instruction-files": "structural",

  // versioning — structural (presence of changelog/guide/version artifacts)
  "versioning/changelog-present": "structural",
  "versioning/semver-versioning": "structural",
  "versioning/migration-guide-present": "structural",
  // versioning — detection (flag @deprecated tags without guidance in source)
  "versioning/deprecation-markers": "detection",

  // ai-governance — detection. Every ai-governance rule detects an AI
  // affordance by source heuristics (name vocabulary, ARIA proximity, locale
  // phrase matching), NOT a deterministic file-presence/structure check.
  // Whether a flagged component truly is an AI marker / disclaimer / etc. needs
  // judgement, so these route to the LLM-judge + human packet, never auto-label.
  "ai-governance/ai-marker-component-present": "detection",
  "ai-governance/ai-content-live-region": "detection",
  "ai-governance/ai-loading-error-states": "detection",
  "ai-governance/feedback-control-present": "detection",
  "ai-governance/confidence-indicator-present": "detection",
  "ai-governance/source-attribution-present": "detection",
  "ai-governance/bot-identity-labeling": "detection",
  "ai-governance/interaction-pattern-docs": "detection",
  "ai-governance/draft-attribution": "detection",
  "ai-governance/product-analytics": "detection",
  // ai-governance — detection (flag misuse pattern in source)
  "ai-governance/ai-token-misuse": "detection",
};

export function measureKindOf(ruleId: string): MeasureKind {
  const k = RULE_MEASURE_KIND[ruleId];
  if (k === undefined) throw new Error(`Unclassified rule for measurement: ${ruleId}`);
  return k;
}
