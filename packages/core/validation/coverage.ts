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

  // Axis L — AI-readiness surface (ds-index-exported requires ctx.componentsModule — not injectable from fixtures)
  "ai-surface/ds-index-exported": "construction: design-system index export file injection — blocked: needs ctx.componentsModule workspace config",

  // Axis R — AI token governance (cross-file AST tracer is recall-failing; injectable only when tracer improved)
  "ai-governance/ai-token-requires-marker": "construction: AST cross-file — recall-failing, needs improved tracer",

  // Info-only rules — severity is intentionally informational; no warning/error path exists, so oracle TPs
  // are structurally impossible with the current severity-aware probe (ruleFlagged counts error/warning only).
  "tokens/description-coverage": "construction: info-only rule — absence of $description emits info, not warning; cannot produce oracle TPs",
  "components/doc-comments": "construction: info-only rule — missing JSDoc emits info, not warning; cannot produce oracle TPs",
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
