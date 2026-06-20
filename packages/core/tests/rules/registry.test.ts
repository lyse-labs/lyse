import { describe, it, expect } from "vitest";
import { ruleObjects, ruleMap } from "../../src/rules/registry.js";

const EXPECTED_IDS = [
  "tokens/no-hardcoded-color",
  "tokens/no-hardcoded-spacing",
  "tokens/dtcg-conformance",
  "tokens/description-coverage",
  "tokens/theme-modes-present",
  "tokens/responsive-breakpoints",
  "tokens/no-hardcoded-media-query",
  "tokens/no-hardcoded-z-index",
  "tokens/no-hardcoded-shadow",
  "tokens/no-hardcoded-typography",
  "tokens/no-hardcoded-opacity",
  "tokens/no-hardcoded-border-radius",
  "tokens/no-hardcoded-border-width",
  "tokens/no-hardcoded-motion",
  "components/no-native-shadows",
  "components/no-icon-fonts",
  "components/contracts-strictness",
  "components/doc-comments",
  "naming/component-pascalcase",
  "naming/hook-prefix",
  "a11y/essentials",
  "a11y/prefers-reduced-motion",
  "a11y/focus-visible",
  "a11y/inclusive-language",
  "a11y/forced-colors",
  "stories/coverage",
  "ai-surface/agents-md-quality",
  "ai-surface/component-manifest-json",
  "ai-surface/ds-index-exported",
  "ai-surface/mcp-config-present",
  "ai-surface/llms-txt-structure",
  "ai-surface/shadcn-registry-valid",
  "ai-surface/agent-instruction-files",
  "ai-governance/ai-tokens-reserved",
  "ai-governance/ai-marker-component-present",
  "ai-governance/explainability-affordance",
  "ai-governance/ai-token-requires-marker",
  "ai-governance/ai-loading-error-states",
  "ai-governance/human-control-affordances",
  "ai-governance/ai-marker-anti-patterns",
  "ai-governance/ai-content-live-region",
  "ai-governance/disclaimer-present",
  "ai-governance/feedback-control-present",
  "ai-governance/value-gate-doc-present",
  "ai-governance/confidence-indicator-present",
  "ai-governance/source-attribution-present",
  "ai-governance/bot-identity-labeling",
  "ai-governance/ai-token-misuse",
  "ai-governance/interaction-pattern-docs",
  "ai-governance/draft-attribution",
];

describe("rules/registry", () => {
  it("ruleObjects and ruleMap have the same length (no orphan or missing entries)", () => {
    expect(ruleMap.size).toBe(ruleObjects.length);
  });

  it("ruleObjects has all expected rule IDs", () => {
    const ids = ruleObjects.map((r) => r.id);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it("ruleMap has all expected rule IDs as keys", () => {
    for (const id of EXPECTED_IDS) {
      expect(ruleMap.has(id)).toBe(true);
    }
  });

  it("ruleMap values match the corresponding ruleObjects entries", () => {
    for (const rule of ruleObjects) {
      expect(ruleMap.get(rule.id)).toBe(rule);
    }
  });

  it("each rule in ruleObjects has id and evaluate properties", () => {
    for (const rule of ruleObjects) {
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.evaluate).toBe("function");
    }
  });
});
