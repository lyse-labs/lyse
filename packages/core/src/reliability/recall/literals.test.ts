import { describe, it, expect } from "vitest";
import { createResolver } from "../../graph/resolve/index.js";
import { generateLiterals } from "./literals.js";
import type { DesignSystemGraph, TokenNode } from "../../graph/types.js";

function graphOf(tokens: TokenNode[]): DesignSystemGraph {
  return { schemaVersion: 1, tokens, components: [], stories: [], usage: [], zones: { byFile: {} }, extraction: { entries: [], conflicts: [] } };
}
const COLORS: TokenNode[] = [
  { id: "c.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" },
  { id: "c.accent", axis: "colors", rawValue: "#e5484d", source: "dtcg" },
  { id: "c.white", axis: "colors", rawValue: "#ffffff", source: "dtcg" }, // trivial → skipped for exact
];

describe("generateLiterals (colours)", () => {
  const g = graphOf(COLORS); const r = createResolver(g);
  it("exact: token values, resolver-confirmed exact, trivial tokens skipped", () => {
    const out = generateLiterals(r, COLORS, "colors", "exact", 10);
    expect(out).toContain("#3b82f6");
    expect(out).not.toContain("#ffffff"); // trivial skipped
    for (const v of out) expect(r.resolve("colors", v).class).toBe("exact");
  });
  it("near: every generated literal resolves near", () => {
    const out = generateLiterals(r, COLORS, "colors", "near", 5);
    expect(out.length).toBeGreaterThan(0);
    for (const v of out) expect(r.resolve("colors", v).class).toBe("near");
  });
  it("novel: every generated literal resolves novel", () => {
    const out = generateLiterals(r, COLORS, "colors", "novel", 5);
    expect(out.length).toBeGreaterThan(0);
    for (const v of out) expect(r.resolve("colors", v).class).toBe("novel");
  });
  it("is deterministic", () => {
    expect(generateLiterals(r, COLORS, "colors", "near", 5)).toEqual(generateLiterals(r, COLORS, "colors", "near", 5));
  });
});
