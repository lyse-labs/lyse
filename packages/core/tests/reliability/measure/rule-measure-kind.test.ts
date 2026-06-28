import { describe, it, expect } from "vitest";
import { RULE_MEASURE_KIND, measureKindOf } from "../../../src/reliability/measure/rule-measure-kind.js";
import { ruleObjects } from "../../../src/rules/registry.js";

describe("rule-measure-kind", () => {
  it("classifies every registry rule (no rule unclassified)", () => {
    const unclassified = ruleObjects.map((r) => r.id).filter((id) => !(id in RULE_MEASURE_KIND));
    expect(unclassified).toEqual([]);
  });
  it("has no stale ids (every mapped id is a real rule)", () => {
    const ids = new Set(ruleObjects.map((r) => r.id));
    const stale = Object.keys(RULE_MEASURE_KIND).filter((id) => !ids.has(id));
    expect(stale).toEqual([]);
  });
  it("classifies render-only rules", () => {
    expect(measureKindOf("a11y/runtime-axe")).toBe("render-only");
    expect(measureKindOf("tokens/rendered-token-fidelity")).toBe("render-only");
  });
  it("classifies a presence rule as structural and a token rule as detection", () => {
    expect(measureKindOf("ai-surface/component-manifest-json")).toBe("structural");
    expect(measureKindOf("tokens/no-hardcoded-color")).toBe("detection");
  });
});
