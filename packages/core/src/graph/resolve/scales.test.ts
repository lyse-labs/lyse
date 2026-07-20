import { describe, it, expect } from "vitest";
import { deriveScale, stepDistance, DEFAULT_SPACING_SCALE } from "./scales.js";
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

describe("deriveScale", () => {
  it("uses the repo's own spacing values when it defines any", () => {
    const g = graphWith([
      { id: "space.md", axis: "spacing", rawValue: "17", source: "dtcg" },
      { id: "space.sm", axis: "spacing", rawValue: "9", source: "dtcg" },
    ]);
    expect(deriveScale(g, "spacing")).toEqual([9, 17]);
  });

  it("falls back to defaults only when the axis has zero tokens", () => {
    const g = graphWith([{ id: "c.brand", axis: "colors", rawValue: "#fff", source: "dtcg" }]);
    expect(deriveScale(g, "spacing")).toEqual([...DEFAULT_SPACING_SCALE]);
  });

  it("ignores non-numeric raw values on numeric axes", () => {
    const g = graphWith([
      { id: "space.a", axis: "spacing", rawValue: "4", source: "dtcg" },
      { id: "space.b", axis: "spacing", rawValue: "auto", source: "dtcg" },
    ]);
    expect(deriveScale(g, "spacing")).toEqual([4]);
  });

  it("de-duplicates and sorts ascending", () => {
    const g = graphWith([
      { id: "a", axis: "spacing", rawValue: "8", source: "dtcg" },
      { id: "b", axis: "spacing", rawValue: "4", source: "tailwind-v4" },
      { id: "c", axis: "spacing", rawValue: "8", source: "css-custom-property" },
    ]);
    expect(deriveScale(g, "spacing")).toEqual([4, 8]);
  });

  it("is deterministic", () => {
    const g = graphWith([
      { id: "b", axis: "spacing", rawValue: "4", source: "dtcg" },
      { id: "a", axis: "spacing", rawValue: "8", source: "dtcg" },
    ]);
    expect(deriveScale(g, "spacing")).toEqual(deriveScale(g, "spacing"));
  });
});

describe("stepDistance", () => {
  const scale = [0, 4, 8, 16, 32];

  it("returns 0 for an on-scale value", () => {
    expect(stepDistance(scale, 8)).toBe(0);
  });

  it("returns 1 for a value between two adjacent entries", () => {
    expect(stepDistance(scale, 6)).toBe(1);
  });

  it("returns 1 for a value just beyond the top of the scale", () => {
    expect(stepDistance(scale, 40)).toBe(1);
  });

  it("grows for values far off the scale", () => {
    expect(stepDistance(scale, 1000)).toBeGreaterThan(1);
  });

  it("returns Infinity for an empty scale", () => {
    expect(stepDistance([], 8)).toBe(Number.POSITIVE_INFINITY);
  });
});
