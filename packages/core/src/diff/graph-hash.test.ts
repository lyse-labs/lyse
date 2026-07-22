import { describe, it, expect } from "vitest";
import { computeGraphHash } from "./graph-hash.js";
import type { DesignSystemGraph } from "../graph/types.js";

function emptyGraph(): DesignSystemGraph {
  return {
    schemaVersion: 1, tokens: [], components: [], stories: [], usage: [],
    zones: { rules: [] } as unknown as DesignSystemGraph["zones"],
    extraction: {} as unknown as DesignSystemGraph["extraction"],
  };
}

function token(id: string, axis: string, rawValue: string): DesignSystemGraph["tokens"][number] {
  return { id, axis, rawValue, source: "dtcg" } as unknown as DesignSystemGraph["tokens"][number];
}

function usage(file: string, count: number): DesignSystemGraph["usage"][number] {
  return { file, kind: "imports-ds-module", count } as unknown as DesignSystemGraph["usage"][number];
}

describe("computeGraphHash", () => {
  it("is deterministic for identical graphs", () => {
    expect(computeGraphHash(emptyGraph())).toBe(computeGraphHash(emptyGraph()));
  });

  it("has the sha256: prefix", () => {
    expect(computeGraphHash(emptyGraph())).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes when a token is added (the DS definition changed)", () => {
    const g = emptyGraph();
    const g2 = { ...g, tokens: [token("color.brand", "colors", "#000")] };
    expect(computeGraphHash(g)).not.toBe(computeGraphHash(g2));
  });

  it("changes when a token's value changes (the scale we judge drift against moved)", () => {
    const a = { ...emptyGraph(), tokens: [token("color.brand", "colors", "#000")] };
    const b = { ...emptyGraph(), tokens: [token("color.brand", "colors", "#111")] };
    expect(computeGraphHash(a)).not.toBe(computeGraphHash(b));
  });

  it("does NOT change when only usage differs — a pure code change must not flag the baseline stale", () => {
    const tokens = [token("color.brand", "colors", "#000")];
    const g1: DesignSystemGraph = { ...emptyGraph(), tokens };
    const g2: DesignSystemGraph = { ...emptyGraph(), tokens, usage: [usage("src/Button.tsx", 3)] };
    expect(computeGraphHash(g1)).toBe(computeGraphHash(g2));
  });

  it("is independent of token list ordering", () => {
    const t1 = token("a.one", "colors", "#000");
    const t2 = token("b.two", "spacing", "4px");
    const g1 = { ...emptyGraph(), tokens: [t1, t2] };
    const g2 = { ...emptyGraph(), tokens: [t2, t1] };
    expect(computeGraphHash(g1)).toBe(computeGraphHash(g2));
  });
});
