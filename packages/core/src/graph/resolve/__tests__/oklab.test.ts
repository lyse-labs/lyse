import { describe, it, expect } from "vitest";
import { srgbToOklab, deltaEOk } from "../oklab.js";
import { parseColor } from "../../../a11y/contrast.js";

describe("srgbToOklab", () => {
  it("maps white to L=1, a=0, b=0", () => {
    const w = srgbToOklab({ r: 255, g: 255, b: 255 });
    expect(w.L).toBeCloseTo(1, 5);
    expect(w.a).toBeCloseTo(0, 5);
    expect(w.b).toBeCloseTo(0, 5);
  });

  it("maps black to L=0, a=0, b=0", () => {
    const k = srgbToOklab({ r: 0, g: 0, b: 0 });
    expect(k.L).toBeCloseTo(0, 5);
    expect(k.a).toBeCloseTo(0, 5);
    expect(k.b).toBeCloseTo(0, 5);
  });

  it("is deterministic across repeated calls", () => {
    const a = srgbToOklab({ r: 59, g: 130, b: 246 });
    const b = srgbToOklab({ r: 59, g: 130, b: 246 });
    expect(a).toEqual(b);
  });
});

describe("deltaEOk", () => {
  it("is zero for identical colors", () => {
    const c = srgbToOklab({ r: 59, g: 130, b: 246 });
    expect(deltaEOk(c, c)).toBe(0);
  });

  it("puts a 1-hex-digit typo under the 0.02 JND threshold", () => {
    // #3b82f6 vs #3c82f5 — the canonical `near` case from the spec.
    const a = srgbToOklab({ r: 0x3b, g: 0x82, b: 0xf6 });
    const b = srgbToOklab({ r: 0x3c, g: 0x82, b: 0xf5 });
    expect(deltaEOk(a, b)).toBeLessThan(0.02);
  });

  it("puts two unrelated brand colors well above the JND threshold", () => {
    const blue = srgbToOklab({ r: 0x3b, g: 0x82, b: 0xf6 });
    const pink = srgbToOklab({ r: 0xff, g: 0x00, b: 0xaa });
    expect(deltaEOk(blue, pink)).toBeGreaterThan(0.02);
  });

  it("is symmetric", () => {
    const a = srgbToOklab({ r: 10, g: 20, b: 30 });
    const b = srgbToOklab({ r: 200, g: 100, b: 50 });
    expect(deltaEOk(a, b)).toBeCloseTo(deltaEOk(b, a), 12);
  });
});

describe("parseColor — modern syntax", () => {
  it("parses oklch() into the same OKLab point as its sRGB equivalent", () => {
    // oklch(1 0 0) is white.
    const c = parseColor("oklch(1 0 0)");
    expect(c).not.toBeNull();
    const lab = srgbToOklab(c!);
    expect(lab.L).toBeCloseTo(1, 2);
  });

  it("parses oklab() literals", () => {
    expect(parseColor("oklab(0.5 0.1 -0.1)")).not.toBeNull();
  });

  it("returns null for syntax it does not model", () => {
    expect(parseColor("color-mix(in oklab, red, blue)")).toBeNull();
    expect(parseColor("lch(50% 40 30)")).toBeNull();
  });
});
