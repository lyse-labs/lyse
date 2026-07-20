import { describe, it, expect } from "vitest";
import { deriveScale, stepDistance, numericValue, DEFAULT_SPACING_SCALE } from "./scales.js";
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

  it("is order-independent: token array order doesn't change the result", () => {
    const gAscending = graphWith([
      { id: "a", axis: "spacing", rawValue: "4", source: "dtcg" },
      { id: "b", axis: "spacing", rawValue: "8", source: "dtcg" },
      { id: "c", axis: "spacing", rawValue: "2", source: "dtcg" },
    ]);
    const gShuffled = graphWith([
      { id: "c", axis: "spacing", rawValue: "2", source: "dtcg" },
      { id: "b", axis: "spacing", rawValue: "8", source: "dtcg" },
      { id: "a", axis: "spacing", rawValue: "4", source: "dtcg" },
    ]);
    expect(deriveScale(gShuffled, "spacing")).toEqual(deriveScale(gAscending, "spacing"));
  });

  it("derives a radii scale from px-suffixed raw values instead of dropping them", () => {
    const g = graphWith([
      { id: "radii.sm", axis: "radii", rawValue: "4px", source: "dtcg" },
      { id: "radii.md", axis: "radii", rawValue: "8px", source: "dtcg" },
    ]);
    expect(deriveScale(g, "radii")).toEqual([4, 8]);
  });
});

describe("numericValue", () => {
  it("extracts the number from a px-suffixed value", () => {
    expect(numericValue("4px")).toBe(4);
  });

  it("extracts the number from a rem-suffixed value", () => {
    expect(numericValue("1rem")).toBe(1);
  });

  it("extracts the number from a fractional rem value", () => {
    expect(numericValue("0.5rem")).toBe(0.5);
  });

  it("extracts the number from a leading-dot decimal", () => {
    expect(numericValue(".5")).toBe(0.5);
  });

  it("extracts the number from a bare numeric string", () => {
    expect(numericValue("16")).toBe(16);
  });

  it("extracts and normalises a duration/ms value", () => {
    expect(numericValue("duration/200ms")).toBe(200);
  });

  it("extracts and normalises a duration/s value to milliseconds", () => {
    expect(numericValue("duration/0.2s")).toBe(200);
  });

  it("returns null for an easing/ value", () => {
    expect(numericValue("easing/cubic-bezier(0,0,1,1)")).toBeNull();
  });

  it("returns null for a non-numeric keyword", () => {
    expect(numericValue("auto")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(numericValue("")).toBeNull();
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

  describe("single-entry scale", () => {
    it("returns 0 for the on-scale value", () => {
      expect(stepDistance([5], 5)).toBe(0);
    });

    it("returns a small distance for a value close to the entry", () => {
      const d = stepDistance([5], 6);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThan(stepDistance([5], 100000));
    });

    it("grows for a value far from the entry", () => {
      expect(stepDistance([5], 100000)).toBeGreaterThan(1);
    });

    it("does not divide by zero or return Infinity when the entry is 0", () => {
      const d = stepDistance([0], 100);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    });
  });
});

describe("numericValue — unit allow-list (rejects relative and malformed values)", () => {
  it("accepts unitless, px, rem and em", () => {
    expect(numericValue("16")).toBe(16);
    expect(numericValue("4px")).toBe(4);
    expect(numericValue("1rem")).toBe(1);
    expect(numericValue("0.5em")).toBe(0.5);
    expect(numericValue(".5")).toBe(0.5);
    expect(numericValue("-4px")).toBe(-4);
  });

  it("rejects relative units that would land on an absolute scale", () => {
    // --radius-full: 50% next to --radius-sm: 4px must not derive [4, 50].
    expect(numericValue("50%")).toBeNull();
    expect(numericValue("100vh")).toBeNull();
    expect(numericValue("50vw")).toBeNull();
    expect(numericValue("2ch")).toBeNull();
  });

  it("rejects compound and malformed values instead of truncating them", () => {
    expect(numericValue("16px solid")).toBeNull();
    expect(numericValue("1e3")).toBeNull();
    expect(numericValue("auto")).toBeNull();
    expect(numericValue("")).toBeNull();
  });

  it("still normalises durations to milliseconds", () => {
    expect(numericValue("duration/200ms")).toBe(200);
    expect(numericValue("duration/0.2s")).toBe(200);
    expect(numericValue("duration/2s")).toBe(2000);
    expect(numericValue("easing/cubic-bezier(0,0,1,1)")).toBeNull();
  });

  it("does not mix a percentage radius into a pixel radii scale", () => {
    const g = graphWith([
      { id: "radii.sm", axis: "radii", rawValue: "4px", source: "css-custom-property" },
      { id: "radii.full", axis: "radii", rawValue: "50%", source: "css-custom-property" },
    ]);
    expect(deriveScale(g, "radii")).toEqual([4]);
  });
});
