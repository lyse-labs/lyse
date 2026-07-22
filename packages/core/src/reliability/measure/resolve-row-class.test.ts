import { describe, it, expect } from "vitest";
import { createResolver } from "../../graph/resolve/index.js";
import { resolveRowClass, axisForRuleId } from "./resolve-row-class.js";
import type { DesignSystemGraph } from "../../graph/types.js";

function graph(tokens: DesignSystemGraph["tokens"]): DesignSystemGraph {
  return { schemaVersion: 1, tokens, components: [], stories: [], usage: [],
    zones: { byFile: {} }, extraction: { entries: [], conflicts: [] } };
}

describe("axisForRuleId", () => {
  it("maps token rules to axes and returns null for non-token rules", () => {
    expect(axisForRuleId("tokens/no-hardcoded-color")).toBe("colors");
    expect(axisForRuleId("tokens/no-hardcoded-spacing")).toBe("spacing");
    expect(axisForRuleId("a11y/essentials")).toBeNull();
  });
});

describe("resolveRowClass", () => {
  const g = graph([{ id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }]);
  it("classifies an exact literal as exact", () => {
    expect(resolveRowClass("#3b82f6", "colors", createResolver(g))).toBe("exact");
  });
  it("classifies a near literal as near", () => {
    expect(resolveRowClass("#3c82f5", "colors", createResolver(g))).toBe("near");
  });
  it("classifies an unrelated literal as novel", () => {
    expect(resolveRowClass("#ff00aa", "colors", createResolver(g))).toBe("novel");
  });
});
