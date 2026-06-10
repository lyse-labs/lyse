import { describe, expect, it } from "vitest";
import { getRubricDimensions } from "../rubric.js";
import type { RubricDimension } from "../rubric.js";
import { ruleMap } from "../../rules/registry.js";

describe("getRubricDimensions", () => {
  const dims = getRubricDimensions();

  it("defines exactly 7 governance dimensions", () => {
    expect(dims).toHaveLength(7);
  });

  it("each dimension has a unique key", () => {
    const keys = dims.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every dimension uses the ai-governance axis", () => {
    for (const d of dims) expect(d.axis).toBe("ai-governance");
  });

  it("every dimension ruleId is registered (validator will not drop it)", () => {
    for (const d of dims) {
      expect(ruleMap.has(d.ruleId), `${d.key}: ${d.ruleId} not in ruleMap`).toBe(true);
    }
  });

  it("maps the 7 dimensions onto the expected registered rule ids", () => {
    const byKey = new Map<string, RubricDimension>(dims.map((d) => [d.key, d]));
    expect(byKey.get("human-control-enforced")?.ruleId).toBe("ai-governance/human-control-affordances");
    expect(byKey.get("voice-anti-anthropomorphism")?.ruleId).toBe("ai-governance/ai-marker-anti-patterns");
    expect(byKey.get("explanation-quality")?.ruleId).toBe("ai-governance/explainability-affordance");
    expect(byKey.get("risk-classification")?.ruleId).toBe("ai-governance/disclaimer-present");
    expect(byKey.get("value-gate-judgment")?.ruleId).toBe("ai-governance/value-gate-doc-present");
    expect(byKey.get("recovery-flow-behavioral")?.ruleId).toBe("ai-governance/ai-loading-error-states");
    expect(byKey.get("explainability-coverage-behavioral")?.ruleId).toBe("ai-governance/explainability-affordance");
  });

  it("recovery-flow-behavioral dimension is behavioral (not a presence re-check)", () => {
    const byKey = new Map<string, RubricDimension>(dims.map((d) => [d.key, d]));
    const dim = byKey.get("recovery-flow-behavioral");
    expect(dim).toBeDefined();
    expect(dim?.key).toBe("recovery-flow-behavioral");
    expect(dim?.axis).toBe("ai-governance");
    expect(dim?.ruleId).toBe("ai-governance/ai-loading-error-states");
    expect(dim?.guidelines).toHaveLength(0);
    // Prompt must mention recovery affordance and graceful degradation
    expect(dim?.prompt).toMatch(/retry|regenerate|recovery/i);
    expect(dim?.prompt).toMatch(/graceful/i);
    // Must contain evidence-contract substrings
    expect(dim?.prompt).toMatch(/exact code snippet/i);
    expect(dim?.prompt).toMatch(/file path/i);
    expect(dim?.prompt).toMatch(/\{ "findings": \[\] \}/);
  });

  it("explainability-coverage-behavioral dimension has correct shape", () => {
    const byKey = new Map<string, RubricDimension>(dims.map((d) => [d.key, d]));
    const dim = byKey.get("explainability-coverage-behavioral");
    expect(dim).toBeDefined();
    expect(dim?.ruleId).toBe("ai-governance/explainability-affordance");
    expect(dim?.guidelines).toEqual([]);
  });

  it("each dimension carries the full rubric shape", () => {
    for (const d of dims) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.question.length).toBeGreaterThan(0);
      expect(d.scale.length).toBeGreaterThan(0);
      expect(d.evidence.length).toBeGreaterThan(0);
      expect(d.prompt.length).toBeGreaterThan(0);
      expect(Array.isArray(d.guidelines)).toBe(true);
      expect(d.guidelines).toHaveLength(0);
    }
  });

  it("every prompt forces evidence citation so the Track 4.2 validator can verify", () => {
    for (const d of dims) {
      expect(d.prompt).toMatch(/exact code snippet/i);
      expect(d.prompt).toMatch(/file path/i);
      expect(d.prompt).toMatch(/\{ "findings": \[\] \}/);
    }
  });

  it("is deterministic across calls", () => {
    expect(getRubricDimensions()).toEqual(getRubricDimensions());
  });
});
