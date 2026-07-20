import { describe, it, expect } from "vitest";
import { createResolver, DEFAULT_RESOLVER_CONFIG } from "./index.js";
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

  // C1: `exact` used to be byte-string equality, so the two most common ways of
  // writing the exact token color in source both landed in `near`.
  it("resolves an uppercase hex of the token color as exact", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "#3B82F6");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["color.brand.primary"]);
  });

  it("resolves the rgb() spelling of the token color as exact", () => {
    const r = createResolver(COLOR_GRAPH).resolve("colors", "rgb(59, 130, 246)");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["color.brand.primary"]);
  });

  it("matches an 8-bit alpha token against a fractional rgba() alpha", () => {
    const g = graphWith([
      { id: "color.overlay", axis: "colors", rawValue: "#3b82f680", source: "dtcg" },
    ]);
    const r = createResolver(g).resolve("colors", "rgba(59, 130, 246, 0.5)");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["color.overlay"]);
  });

  // M1: near used to return a single winner while every other class returned
  // all ties.
  it("returns every tied token id for a near color", () => {
    const g = graphWith([
      { id: "brand.b", axis: "colors", rawValue: "#3c82f5", source: "dtcg" },
      { id: "brand.a", axis: "colors", rawValue: "#3c82f5", source: "dtcg" },
    ]);
    const r = createResolver(g).resolve("colors", "#3b82f6");
    expect(r.class).toBe("near");
    expect(r.tokenIds).toEqual(["brand.a", "brand.b"]);
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

  // C1: graph dimension values are px-stripped upstream, so a source literal
  // never string-matched its own token and every unit-bearing value fell to
  // `near` at distance 0 — outside the only class that scores and auto-fixes.
  it("resolves a px literal as exact against a px-stripped token", () => {
    const r = createResolver(g).resolve("spacing", "8px");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["space.2"]);
  });

  it("resolves a px literal as exact on any numeric axis", () => {
    const wide = graphWith([
      { id: "space.4", axis: "spacing", rawValue: "16", source: "dtcg" },
      { id: "bp.md", axis: "breakpoints", rawValue: "768", source: "dtcg" },
      { id: "radius.sm", axis: "radii", rawValue: "4", source: "dtcg" },
    ]);
    const resolver = createResolver(wide);
    expect(resolver.resolve("spacing", "16px")).toEqual({
      class: "exact",
      tokenIds: ["space.4"],
    });
    expect(resolver.resolve("breakpoints", "768px")).toEqual({
      class: "exact",
      tokenIds: ["bp.md"],
    });
    expect(resolver.resolve("radii", "4px")).toEqual({
      class: "exact",
      tokenIds: ["radius.sm"],
    });
  });

  it("returns every tied token id for a near value", () => {
    const r = createResolver(g).resolve("spacing", "6");
    expect(r.class).toBe("near");
    expect(r.tokenIds).toEqual(["space.1", "space.2"]);
  });
});

describe("motion", () => {
  const g = graphWith([
    { id: "motion.fast", axis: "motion", rawValue: "duration/200ms", source: "dtcg" },
    { id: "motion.slow", axis: "motion", rawValue: "duration/400ms", source: "dtcg" },
    {
      id: "motion.standard",
      axis: "motion",
      rawValue: "easing/cubic-bezier(0.4, 0, 0.2, 1)",
      source: "dtcg",
    },
  ]);

  // I1: a raw duration literal has no `duration/` prefix, so numericValue
  // rejected it and the resolver abstained on every animation in the codebase.
  it("resolves a raw ms literal as exact", () => {
    const r = createResolver(g).resolve("motion", "200ms");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["motion.fast"]);
  });

  it("resolves a raw seconds literal as exact", () => {
    const r = createResolver(g).resolve("motion", "0.2s");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["motion.fast"]);
  });

  // C1: the graph-canonical spelling and the source spelling of the same
  // duration must land in the same class.
  it("agrees on the graph-canonical and the source spelling of one duration", () => {
    const resolver = createResolver(g);
    const canonical = resolver.resolve("motion", "duration/400ms");
    const source = resolver.resolve("motion", "0.4s");
    expect(canonical).toEqual({ class: "exact", tokenIds: ["motion.slow"] });
    expect(source).toEqual(canonical);
  });

  it("resolves an off-scale duration as novel", () => {
    expect(createResolver(g).resolve("motion", "5000ms").class).toBe("novel");
  });

  // C2: motion was a numeric axis and numericValue rejects easing curves, so
  // every non-matching curve became `unresolved` — the whole easing half of the
  // axis was silent.
  it("resolves a non-matching easing curve as novel, not unresolved", () => {
    const r = createResolver(g).resolve("motion", "cubic-bezier(0.1, 0.7, 1, 0.1)");
    expect(r.class).toBe("novel");
    expect(r.tokenIds).toEqual([]);
  });

  it("resolves a matching easing curve as exact regardless of spacing", () => {
    const r = createResolver(g).resolve("motion", "cubic-bezier(0.4,  0,   0.2, 1)");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["motion.standard"]);
  });

  it("never returns near for an easing curve", () => {
    expect(createResolver(g).resolve("motion", "cubic-bezier(0.4, 0, 0.2, 0.9)").class)
      .not.toBe("near");
  });

  it("abstains on a token reference", () => {
    expect(createResolver(g).resolve("motion", "var(--duration-fast)").class)
      .toBe("unresolved");
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

  it("matches an identical shadow through whitespace and case noise", () => {
    const r = createResolver(g).resolve("shadows", "0  1PX   2px  rgba(0,0,0,.1) ");
    expect(r.class).toBe("exact");
    expect(r.tokenIds).toEqual(["shadow.md"]);
  });

  // I3: unresolved was unreachable on composite axes, so a token reference or a
  // CSS-wide keyword was reported as drift.
  it.each([
    "var(--shadow-md)",
    "$shadow-md",
    "inherit",
    "initial",
    "unset",
    "revert",
    "none",
    "auto",
    "currentColor",
    "",
    "   ",
  ])("abstains on the opaque literal %j", (literal) => {
    expect(createResolver(g).resolve("shadows", literal).class).toBe("unresolved");
  });

  it("applies the same three verdicts to typography", () => {
    const t = graphWith([
      { id: "font.body", axis: "typography", rawValue: "16px/1.5 system-ui", source: "dtcg" },
    ]);
    const resolver = createResolver(t);
    expect(resolver.resolve("typography", "16px/1.5 system-ui").class).toBe("exact");
    expect(resolver.resolve("typography", "13px/1.2 Comic Sans").class).toBe("novel");
    expect(resolver.resolve("typography", "var(--font-body)").class).toBe("unresolved");
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

  // I2: results used to be shared singletons and memoized objects, so a caller
  // mutating one corrupted every later verdict — process-wide, across resolvers.
  it("is not corrupted by a caller mutating a returned result", () => {
    const resolver = createResolver(COLOR_GRAPH);
    const first = resolver.resolve("colors", "#3b82f6");
    first.tokenIds.push("attacker.injected");
    first.class = "novel";

    const second = resolver.resolve("colors", "#3b82f6");
    expect(second.class).toBe("exact");
    expect(second.tokenIds).toEqual(["color.brand.primary"]);
  });

  it("does not leak a mutated result into a different resolver instance", () => {
    const novelResult = createResolver(COLOR_GRAPH).resolve("colors", "#ff00aa");
    novelResult.tokenIds.push("attacker.injected");
    const unresolvedResult = createResolver(COLOR_GRAPH).resolve("colors", "nonsense");
    unresolvedResult.tokenIds.push("attacker.injected");

    const fresh = createResolver(COLOR_GRAPH);
    expect(fresh.resolve("colors", "#ff00aa").tokenIds).toEqual([]);
    expect(fresh.resolve("colors", "nonsense").tokenIds).toEqual([]);
  });

  it("exposes an immutable default config", () => {
    expect(Object.isFrozen(DEFAULT_RESOLVER_CONFIG)).toBe(true);
  });

  it("sorts tokenIds with a total order when several tokens share a value", () => {
    const g = graphWith([
      { id: "z.beta", axis: "colors", rawValue: "#000000", source: "dtcg" },
      { id: "a.alpha", axis: "colors", rawValue: "#000000", source: "dtcg" },
    ]);
    expect(createResolver(g).resolve("colors", "#000000").tokenIds).toEqual(["a.alpha", "z.beta"]);
  });
});
