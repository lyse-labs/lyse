import { describe, it, expect } from "vitest";
import { ruleObjects, ruleMap } from "../../src/rules/registry.js";

const EXPECTED_IDS = [
  "tokens/no-hardcoded-color",
  "tokens/no-hardcoded-spacing",
  "tokens/dtcg-conformance",
  "tokens/description-coverage",
  "components/no-native-shadows",
  "naming/component-pascalcase",
  "naming/hook-prefix",
  "a11y/essentials",
  "stories/coverage",
  "ai-surface/agents-md-quality",
  "ai-surface/component-manifest-json",
  "ai-surface/ds-index-exported",
];

describe("rules/registry", () => {
  it("ruleObjects contains exactly 12 rules", () => {
    expect(ruleObjects).toHaveLength(12);
  });

  it("ruleObjects has all expected rule IDs", () => {
    const ids = ruleObjects.map((r) => r.id);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it("ruleMap has exactly 12 entries", () => {
    expect(ruleMap.size).toBe(12);
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
