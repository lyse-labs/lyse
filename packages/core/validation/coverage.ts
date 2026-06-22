import { ruleMap } from "../src/rules/registry.js";
import { adapters } from "./adapters/index.js";

/**
 * Rules that have a construction/execution oracle per coverage-universe.md
 * but whose adapter is not yet built. Value = oracle type + one-line note.
 * These are a tracked worklist, not silent gaps.
 */
export const ADDRESSABLE_PENDING: Record<string, string> = {
  // Axis A — Design Tokens (DTCG)
  "tokens/dtcg-conformance": "construction: DTCG $type/$value schema injection",
  "tokens/description-coverage": "construction: $description field presence injection",
  "tokens/deprecated-token-usage": "construction: @deprecated marker injection",
  "tokens/theme-modes-present": "construction: mode-key file presence injection",
  "tokens/css-custom-property-export": "construction: CSS custom-property export file presence",

  // Axis B — Token adoption / hardcoded values
  "tokens/no-hardcoded-typography": "construction: CSS typography literal injection",
  "tokens/no-hardcoded-shadow": "construction: CSS box-shadow literal injection",
  "tokens/no-hardcoded-motion": "construction: CSS transition/duration literal injection",
  "tokens/no-hardcoded-media-query": "construction: CSS media-query breakpoint literal injection",
  "tokens/no-hardcoded-gradient": "construction: CSS gradient literal injection",
  "tokens/responsive-breakpoints": "construction: breakpoint token reference injection",
  "tokens/container-query": "construction: container-query vs media-query pattern injection",

  // Axis C — Accessibility
  "a11y/essentials": "construction: static-injectable AST (jsx-a11y subset — img alt, form labels)",
  "a11y/html-lang": "construction: HTML lang attribute injection",
  "a11y/semantic-html": "construction: semantic element vs div injection",
  "a11y/prefers-reduced-motion": "construction: @media prefers-reduced-motion guard injection",
  "a11y/forced-colors": "construction: @media forced-colors guard injection",
  "a11y/focus-visible": "construction: :focus-visible CSS selector injection",
  "a11y/inclusive-language": "construction: banned-word vocabulary injection",

  // Axis D — Components / API quality
  "components/doc-comments": "construction: JSDoc comment presence injection",
  "components/svg-viewbox": "construction: SVG viewBox attribute injection",
  "components/icon-decorative-aria": "construction: aria-hidden on decorative icon injection",
  "components/no-icon-fonts": "construction: icon-font class usage injection",
  "components/no-native-shadows": "construction: CSS box-shadow on native element injection",

  // Axis E — Documentation / Stories
  "stories/coverage": "construction: story file presence cross-reference injection",

  // Axis F — Versioning / lifecycle
  "versioning/semver-versioning": "construction: package.json version field SemVer pattern",
  "versioning/migration-guide-present": "construction: MIGRATION.md file presence injection",
  "versioning/deprecation-markers": "construction: @deprecated JSDoc marker injection",

  // Naming
  "naming/component-pascalcase": "construction: component filename casing injection",
  "naming/hook-prefix": "construction: hook filename prefix injection",

  // Axis L — AI-readiness surface
  "ai-surface/agents-md-quality": "construction: AGENTS.md structured-content injection",
  "ai-surface/mcp-config-present": "construction: .mcp.json / mcp-config file presence injection",
  "ai-surface/component-manifest-json": "construction: component-manifest JSON schema injection",
  "ai-surface/ds-index-exported": "construction: design-system index export file injection",
  "ai-surface/shadcn-registry-valid": "construction: shadcn registry JSON schema injection",
  "ai-surface/agent-instruction-files": "construction: agent instruction file presence injection",

  // Axis M — AI marking & identity (proxy but structurally injectable)
  "ai-governance/ai-marker-component-present": "proxy: AI-label component vocabulary injection",
  "ai-governance/bot-identity-labeling": "proxy: bot-identity vocab injection",

  // Axis N — AI explainability & trust
  "ai-governance/source-attribution-present": "proxy: source-attribution vocabulary injection",
  "ai-governance/confidence-indicator-present": "proxy: confidence-indicator vocabulary injection",

  // Axis O — AI control & feedback
  "ai-governance/feedback-control-present": "proxy: feedback-control vocabulary injection",
  "ai-governance/product-analytics": "proxy: analytics event vocabulary injection",

  // Axis P — AI safety & failure (Cloudscape structural)
  "ai-governance/ai-loading-error-states": "proxy: AI loading/error state vocabulary injection",
  "ai-governance/ai-content-live-region": "proxy: aria live-region vocabulary injection",

  // Axis Q — AI governance docs
  "ai-governance/value-gate-doc-present": "construction: AI_GOVERNANCE.md file presence injection",
  "ai-governance/interaction-pattern-docs": "construction: interaction-pattern doc presence injection",

  // Axis R — AI token governance
  "ai-governance/ai-tokens-reserved": "construction: reserved AI token declaration injection",
  "ai-governance/ai-token-misuse": "construction: AI token cross-file usage injection",
};

/**
 * Rules with no construction/execution oracle — subjective quality or irreducibly
 * vocabulary-only with no stable affordance denominator. Per coverage-universe.md.
 * Each entry carries a reason. These are reported as advisory, never scored as proven.
 */
export const JUDGMENT_RULES: Record<string, string> = {
  "components/contracts-strictness": "strictness is a graded design judgment; AST can detect presence but not adequacy",
  "ai-governance/ai-marker-anti-patterns": "anti-pattern vocabulary set has no stable authoritative closure; proxy-only",
  "ai-governance/disclaimer-present": "disclaimer vocabulary has no authoritative fixed form; proxy with high FP risk",
  "ai-governance/explainability-affordance": "explainability is a graded UX judgment; no single injected-defect oracle",
  "ai-governance/human-control-affordances": "control affordance vocabulary is open-ended; no stable structural oracle",
  "ai-governance/draft-attribution": "attribution convention is editorial; proxy vocab only, no defect injection",
  "ai-governance/ai-token-requires-marker": "recall-failing in bench: AST cross-file trace brittle; deferred to judgment tier",
};

export function coverageGaps(): { uncovered: string[]; covered: string[]; addressablePending: string[]; judgmentOnly: string[] } {
  const covered = new Set(adapters.map((a) => a.ruleId));
  const addressable = new Set(Object.keys(ADDRESSABLE_PENDING));
  const judged = new Set(Object.keys(JUDGMENT_RULES));
  const uncovered: string[] = [];
  const coveredList: string[] = [];
  const addressablePendingList: string[] = [];
  const judgmentOnlyList: string[] = [];

  for (const ruleId of ruleMap.keys()) {
    if (covered.has(ruleId)) {
      coveredList.push(ruleId);
    } else if (addressable.has(ruleId)) {
      addressablePendingList.push(ruleId);
    } else if (judged.has(ruleId)) {
      judgmentOnlyList.push(ruleId);
    } else {
      uncovered.push(ruleId);
    }
  }

  return {
    uncovered: uncovered.sort(),
    covered: coveredList.sort(),
    addressablePending: addressablePendingList.sort(),
    judgmentOnly: judgmentOnlyList.sort(),
  };
}
