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
    expect(out.length).toBeLessThanOrEqual(5);
    for (const v of out) expect(r.resolve("colors", v).class).toBe("near");
  });
  it("novel: every generated literal resolves novel", () => {
    const out = generateLiterals(r, COLORS, "colors", "novel", 5);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const v of out) expect(r.resolve("colors", v).class).toBe("novel");
  });
  it("is deterministic", () => {
    expect(generateLiterals(r, COLORS, "colors", "near", 5)).toEqual(generateLiterals(r, COLORS, "colors", "near", 5));
  });
});

const SPACING: TokenNode[] = [
  { id: "s.04", axis: "spacing", rawValue: "4px", source: "dtcg" },
  { id: "s.08", axis: "spacing", rawValue: "8px", source: "dtcg" },
  { id: "s.12", axis: "spacing", rawValue: "12px", source: "dtcg" },
  { id: "s.16", axis: "spacing", rawValue: "16px", source: "dtcg" },
  { id: "s.24", axis: "spacing", rawValue: "24px", source: "dtcg" },
  { id: "s.32", axis: "spacing", rawValue: "32px", source: "dtcg" },
  { id: "s.48", axis: "spacing", rawValue: "48px", source: "dtcg" },
];

describe("generateLiterals (numeric / spacing)", () => {
  const g = graphOf(SPACING); const r = createResolver(g);
  it("near: every generated literal resolves near, capped", () => {
    const out = generateLiterals(r, SPACING, "spacing", "near", 5);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const v of out) expect(r.resolve("spacing", v).class).toBe("near");
  });
  it("novel: every generated literal resolves novel, capped", () => {
    const out = generateLiterals(r, SPACING, "spacing", "novel", 5);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(5);
    for (const v of out) expect(r.resolve("spacing", v).class).toBe("novel");
  });
  it("is deterministic", () => {
    expect(generateLiterals(r, SPACING, "spacing", "near", 5)).toEqual(generateLiterals(r, SPACING, "spacing", "near", 5));
  });
});
