import { describe, it, expect } from "vitest";
import { createResolver } from "./index.js";
import type { DesignSystemGraph, TokenNode } from "../types.js";

function graphWith(tokens: TokenNode[]): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens,
    components: [],
    stories: [],
    usage: [],
    zones: { byFile: {} },
    extraction: { entries: [], conflicts: [] },
  };
}

const COLOR_GRAPH = graphWith([
  { id: "color.brand.primary", axis: "colors", rawValue: "#3b82f6", source: "dtcg" },
]);

describe("colors", () => {
  it("resolves an identical value as exact and names the token", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "#3b82f6");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["color.brand.primary"]);
  });

  it("resolves a one-digit typo as near, not exact and not novel", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "#3c82f5");
    expect(r.class).toBe("near");
    expect(r.tokenIds).toEqual(["color.brand.primary"]);
    expect(r.distance).toBeGreaterThan(0);
  });

  it("resolves an unrelated color as novel with no token", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "#ff00aa");
    expect(r.class).toBe("novel");
    expect(r.tokenIds).toEqual([]);
  });

  it("resolves unparseable syntax as unresolved", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "color-mix(in oklab, red, blue)");
    expect(r.class).toBe("unresolved");
  });

  it("does not treat an alpha-only difference as exact", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "#3b82f680");
    expect(r.class).not.toBe("exact");
  });
});

describe("numeric axes", () => {
  const g = graphWith([
    { id: "space.1", axis: "spacing", rawValue: "4", source: "dtcg" },
    { id: "space.2", axis: "spacing", rawValue: "8", source: "dtcg" },
  ]);

  it("resolves an on-scale value as exact", () => {
    const r = createResolver(g).resolve("spacing", "8");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["space.2"]);
  });

  it("resolves a one-step-off value as near", () => {
    expect(createResolver(g).resolve("spacing", "6").class).toBe("near");
  });

  it("resolves a far-off value as novel", () => {
    expect(createResolver(g).resolve("spacing", "1000").class).toBe("novel");
  });

  it("resolves a non-numeric literal as unresolved", () => {
    expect(createResolver(g).resolve("spacing", "calc(100% - 2px)").class).toBe("unresolved");
  });
});

describe("composite axes never return near", () => {
  const g = graphWith([
    { id: "shadow.md", axis: "shadows", rawValue: "0 1px 2px rgba(0,0,0,.1)", source: "dtcg" },
  ]);

  it("matches an identical shadow exactly", () => {
    expect(createResolver(g).resolve("shadows", "0 1px 2px rgba(0,0,0,.1)").class).toBe("exact");
  });

  it("classifies a slightly different shadow as novel, never near", () => {
    const r = createResolver(g).resolve("shadows", "0 1px 3px rgba(0,0,0,.1)");
    expect(r.class).toBe("novel");
    expect(r.class).not.toBe("near");
  });
});

describe("invariants", () => {
  it("returns exactly one of the four classes for every input", () => {
    const resolver = createResolver(COLOR_GRAPH);
    const inputs = ["#3b82f6", "#3c82f5", "#ff00aa", "nonsense", "", "var(--x)"];
    for (const value of inputs) {
      const r = resolver.resolve("colors", value);
      expect(["exact", "near", "novel", "unresolved"]).toContain(r.class);
    }
  });

  it("memoizes without changing the answer", () => {
    const resolver = createResolver(COLOR_GRAPH);
    const first = resolver.resolve("colors", "#3c82f5");
    const second = resolver.resolve("colors", "#3c82f5");
    expect(second).toEqual(first);
  });

  it("counts unresolved verdicts once per distinct value", () => {
    const resolver = createResolver(COLOR_GRAPH);
    resolver.resolve("colors", "color-mix(in oklab, red, blue)");
    resolver.resolve("colors", "color-mix(in oklab, red, blue)");
    expect(resolver.abstentions()).toBe(1);
  });

  it("sorts tokenIds with a total order when several tokens share a value", () => {
    const g = graphWith([
      { id: "z.beta", axis: "colors", rawValue: "#000000", source: "dtcg" },
      { id: "a.alpha", axis: "colors", rawValue: "#000000", source: "dtcg" },
    ]);
    expect(createResolver(g).resolve("colors", "#000000").tokenIds).toEqual(["a.alpha", "z.beta"]);
  });
});
