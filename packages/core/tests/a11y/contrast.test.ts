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

// ---------------------------------------------------------------------------
// CSS Color Level 4 — space-separated rgb()/hsl() with an optional `/ alpha`.
// This is the canonical form emitted by Tailwind v4 and shadcn/ui themes, so a
// parser that only understands the comma-separated Level 3 form silently drops
// every modern theme value handed to it.
// ---------------------------------------------------------------------------
describe("parseColor — CSS Color Level 4 space-separated syntax", () => {
  it("parses rgb(R G B)", () => {
    expect(parseColor("rgb(255 0 170)")).toEqual({ r: 255, g: 0, b: 170, a: 1 });
  });

  it("parses rgb(R G B / A) with a percentage alpha", () => {
    expect(parseColor("rgb(255 0 170 / 50%)")).toEqual({ r: 255, g: 0, b: 170, a: 0.5 });
  });

  it("parses rgb(R G B / A) with a numeric alpha", () => {
    expect(parseColor("rgb(37 99 235 / 0.25)")).toEqual({ r: 37, g: 99, b: 235, a: 0.25 });
  });

  it("parses rgba() in the space-separated form too", () => {
    expect(parseColor("rgba(0 0 0 / 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it("parses hsl(H S% L%) — the shadcn/ui + Tailwind v4 theme form", () => {
    // hsl(222.2 84% 4.9%) is shadcn/ui's default `--background` in dark mode.
    expect(parseColor("hsl(222.2 84% 4.9%)")).toEqual({ r: 2, g: 8, b: 23, a: 1 });
  });

  it("parses hsl(H S% L% / A)", () => {
    expect(parseColor("hsl(0 0% 100% / 25%)")).toEqual({ r: 255, g: 255, b: 255, a: 0.25 });
  });

  it("parses hsla() in the space-separated form too", () => {
    expect(parseColor("hsla(221 83% 53% / 1)")).toEqual({ ...parseColor("hsl(221, 83%, 53%)")! });
  });

  it("agrees with the comma-separated form for the same color", () => {
    expect(parseColor("rgb(37 99 235)")).toEqual(parseColor("rgb(37, 99, 235)"));
    expect(parseColor("hsl(221 83% 53%)")).toEqual(parseColor("hsl(221, 83%, 53%)"));
  });

  it("still rejects malformed argument lists", () => {
    expect(parseColor("rgb(255 0)")).toBeNull();
    expect(parseColor("rgb(255 0 170 / 0.5 / 0.5)")).toBeNull();
    expect(parseColor("rgb(255 0 170 /)")).toBeNull();
    expect(parseColor("hsl(221 83% 53% 1 2)")).toBeNull();
    expect(parseColor("rgb(300 0 0)")).toBeNull();
  });

  it("keeps the comma-separated behaviour byte-identical", () => {
    expect(parseColor("rgb(37, 99, 235)")).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    // A percentage alpha is Level-4-only syntax: in the Level 3 comma form it
    // was, and stays, unparseable.
    expect(parseColor("rgba(0, 0, 0, 50%)")).toBeNull();
    expect(parseColor("hsl(210, 40%, 98%)")).toEqual({ r: 248, g: 250, b: 252, a: 1 });
  });
});
