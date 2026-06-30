import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, parseColor } from "../../src/a11y/contrast.js";

describe("WCAG contrast util", () => {
  it("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
  it("white on white is 1:1", () => {
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
  });
  it("#767676 on white passes AA (~4.54)", () => {
    expect(contrastRatio("#767676", "#ffffff")!).toBeGreaterThanOrEqual(4.5);
  });
  it("#999999 on white fails AA (<4.5)", () => {
    expect(contrastRatio("#999999", "#ffffff")!).toBeLessThan(4.5);
  });
  it("returns null when a side has alpha < 1", () => {
    expect(contrastRatio("rgba(0,0,0,0.5)", "#fff")).toBeNull();
  });
  it("returns null for an unparseable color", () => {
    expect(contrastRatio("var(--x)", "#fff")).toBeNull();
    expect(parseColor("notacolor")).toBeNull();
  });
  it("relativeLuminance: white=1, black=0", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});
