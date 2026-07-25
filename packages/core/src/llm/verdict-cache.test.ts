import { describe, it, expect } from "vitest";
import { findingContentHash, tokenContextHash, verdictKey, axisForTargetRule } from "./verdict-cache.js";
import type { Finding } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file: "src/App.tsx", line: 3, column: 5 },
    message: "Hardcoded color value: #5865f2",
    fixGroup: { key: "k", from: "#5865f2" },
    ...over,
  } as Finding;
}
function graph(tokens: DesignSystemGraph["tokens"]): DesignSystemGraph {
  return { schemaVersion: 1, tokens, components: [], stories: [], usage: [],
    zones: { byFile: {} }, extraction: { entries: [], conflicts: [] } };
}
const G = graph([{ id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }]);

describe("axisForTargetRule", () => {
  it("maps the two target rules, null otherwise", () => {
    expect(axisForTargetRule("tokens/no-hardcoded-color")).toBe("colors");
    expect(axisForTargetRule("tokens/no-hardcoded-spacing")).toBe("spacing");
    expect(axisForTargetRule("a11y/essentials")).toBeNull();
  });
});

describe("findingContentHash — reformat-proof, per-value", () => {
  it("is identical when only line/column change (reformat)", () => {
    expect(findingContentHash(finding({ location: { file: "src/App.tsx", line: 3, column: 5 } })))
      .toBe(findingContentHash(finding({ location: { file: "src/App.tsx", line: 99, column: 1 } })));
  });
  it("changes when the file changes (literal moved)", () => {
    expect(findingContentHash(finding({ location: { file: "src/Other.tsx", line: 3, column: 5 } })))
      .not.toBe(findingContentHash(finding()));
  });
  it("changes when the value changes", () => {
    expect(findingContentHash(finding({ fixGroup: { key: "k", from: "#ff00aa" } })))
      .not.toBe(findingContentHash(finding()));
  });
});

describe("tokenContextHash — axis-scoped", () => {
  it("changes when a token OF THAT axis changes", () => {
    const g2 = graph([{ id: "color.brand", axis: "colors", rawValue: "#2563eb", source: "dtcg" }]);
    expect(tokenContextHash(g2, "colors")).not.toBe(tokenContextHash(G, "colors"));
  });
  it("does NOT change when a token of ANOTHER axis changes", () => {
    const g2 = graph([...G.tokens, { id: "space.md", axis: "spacing", rawValue: "16", source: "dtcg" }]);
    expect(tokenContextHash(g2, "colors")).toBe(tokenContextHash(G, "colors"));
  });
  it("is order-independent", () => {
    const a = graph([{ id: "a", axis: "colors", rawValue: "#111", source: "dtcg" }, { id: "b", axis: "colors", rawValue: "#222", source: "dtcg" }]);
    const b = graph([{ id: "b", axis: "colors", rawValue: "#222", source: "dtcg" }, { id: "a", axis: "colors", rawValue: "#111", source: "dtcg" }]);
    expect(tokenContextHash(a, "colors")).toBe(tokenContextHash(b, "colors"));
  });
});

describe("verdictKey", () => {
  it("combines both hashes for a target rule", () => {
    expect(verdictKey(finding(), G)).toBe(`${findingContentHash(finding())}:${tokenContextHash(G, "colors")}`);
  });
  it("is null for a non-target rule", () => {
    expect(verdictKey(finding({ ruleId: "a11y/essentials" }), G)).toBeNull();
  });
});
