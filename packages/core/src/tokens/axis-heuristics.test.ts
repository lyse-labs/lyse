import { describe, it, expect } from "vitest";
import { dimensionAxisForPath, numberAxisForPath } from "./axis-heuristics.js";
import { axisFor } from "../graph/extract/tokens.js";

/**
 * These heuristics used to exist twice — `graph/extract/tokens.ts#axisFor` and
 * `loaders/tokens.ts#fromDtcg` — held in lockstep only by a comment. These tests
 * pin the shared contract, and pin the ONE difference between the two callers so
 * it cannot be reintroduced accidentally in either direction.
 */
describe("dimensionAxisForPath", () => {
  it.each([
    ["radius/sm", "radii"],
    ["border-radius/lg", "radii"],
    ["borderRadius/full", "radii"],
    ["border-width/thin", "borderWidth"],
    ["borderWidth/thick", "borderWidth"],
    ["breakpoint/md", "breakpoints"],
    ["screen/lg", "breakpoints"],
    ["space/4", "spacing"],
    ["size/gutter", "spacing"],
  ] as const)("routes %s to %s", (path, axis) => {
    expect(dimensionAxisForPath(path)).toBe(axis);
  });

  it("defaults to spacing — a dimension always lands somewhere", () => {
    expect(dimensionAxisForPath("totally/unrelated")).toBe("spacing");
  });

  it("checks radius before borderWidth, so `border-radius` is a radius", () => {
    expect(dimensionAxisForPath("border-radius/sm")).toBe("radii");
  });
});

describe("numberAxisForPath", () => {
  it.each([
    ["z-index/modal", "zIndex"],
    ["zIndex/dropdown", "zIndex"],
    ["opacity/disabled", "opacity"],
  ] as const)("routes %s to %s regardless of allowZPrefix", (path, axis) => {
    expect(numberAxisForPath(path, { allowZPrefix: true })).toBe(axis);
    expect(numberAxisForPath(path, { allowZPrefix: false })).toBe(axis);
  });

  it("drops a number whose path names no axis — there is no default", () => {
    expect(numberAxisForPath("line-height/tight", { allowZPrefix: true })).toBeUndefined();
  });

  // THE ONE DELIBERATE DIVERGENCE. `--z-modal` is split on `-` into `z/modal`
  // by tokens/normalizer.ts#normalizeCssVars, which only the graph does; a DTCG
  // document nests its own groups and never produces that shape, so the loader
  // has never matched it and keeps not matching it.
  it("accepts a bare `z/` prefix only when allowZPrefix is set", () => {
    expect(numberAxisForPath("z/modal", { allowZPrefix: true })).toBe("zIndex");
    expect(numberAxisForPath("z/modal", { allowZPrefix: false })).toBeUndefined();
  });

  it("does not let the `z/` prefix swallow unrelated z-initial names", () => {
    expect(numberAxisForPath("zoom/level", { allowZPrefix: true })).toBeUndefined();
  });
});

describe("axisFor delegates to the shared heuristics", () => {
  it.each([
    ["radius/sm", "radii"],
    ["border-width/thin", "borderWidth"],
    ["breakpoint/md", "breakpoints"],
    ["space/4", "spacing"],
  ] as const)("dimension %s → %s", (path, axis) => {
    expect(axisFor("dimension", path)).toBe(axis);
  });

  it.each([
    ["z-index/modal", "zIndex"],
    ["z/modal", "zIndex"],
    ["opacity/disabled", "opacity"],
  ] as const)("number %s → %s", (path, axis) => {
    expect(axisFor("number", path)).toBe(axis);
  });

  it("still drops an unroutable number", () => {
    expect(axisFor("number", "line-height/tight")).toBeUndefined();
  });

  it("keeps the $type-only axes untouched", () => {
    expect(axisFor("color", "anything")).toBe("colors");
    expect(axisFor("duration", "anything")).toBe("motion");
    expect(axisFor("cubicBezier", "anything")).toBe("motion");
    expect(axisFor("shadow", "anything")).toBeUndefined();
  });
});
