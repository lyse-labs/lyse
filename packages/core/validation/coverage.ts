import { ruleMap } from "../src/rules/registry.js";
import { adapters } from "./adapters/index.js";

/**
 * Rules that have a construction/execution oracle per coverage-universe.md
 * but whose adapter is not yet built. Value = oracle type + one-line note.
 * These are a tracked worklist, not silent gaps.
 */
export const ADDRESSABLE_PENDING: Record<string, string> = {
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

  // Naming
  "naming/component-pascalcase": "construction: component filename casing injection",
  "naming/hook-prefix": "construction: hook filename prefix injection",

  // Axis L — AI-readiness surface (ds-index-exported requires ctx.componentsModule — not injectable from fixtures)
  "ai-surface/ds-index-exported": "construction: design-system index export file injection — blocked: needs ctx.componentsModule workspace config",

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

  // Axis M — AI governance (moved from JUDGMENT: have proxy/construction oracle)
  "ai-governance/disclaimer-present": "proxy: vocabulary injection — high FP risk",
  "ai-governance/ai-marker-anti-patterns": "proxy: vocabulary/regex injection — high FP risk",
  "ai-governance/ai-token-requires-marker": "construction: AST cross-file — recall-failing, needs improved tracer",
};

/**
 * Rules with no construction/execution oracle — subjective quality or irreducibly
 * vocabulary-only with no stable affordance denominator. Per coverage-universe.md.
 * Each entry carries a reason. These are reported as advisory, never scored as proven.
 */
export const JUDGMENT_RULES: Record<string, string> = {
  "components/contracts-strictness": "strictness is a graded design judgment; AST can detect presence but not adequacy",
  "ai-governance/explainability-affordance": "explainability is a graded UX judgment; no single injected-defect oracle",
  "ai-governance/human-control-affordances": "control affordance vocabulary is open-ended; no stable structural oracle",
  "ai-governance/draft-attribution": "attribution convention is editorial; proxy vocab only, no defect injection",
};

/** Categorize all rules into covered, addressable-pending, judgment-only, and uncovered. */
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
