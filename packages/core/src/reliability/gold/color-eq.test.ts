import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { colorEquals, isColorLiteral } from "./color-eq.js";

describe("gold/color-eq", () => {
  it("equal across representations", () => {
    expect(colorEquals("#3b82f6", "#3B82F6")).toBe(true);
    expect(colorEquals("#fff", "#ffffff")).toBe(true);
    expect(colorEquals("#3b82f6", "rgb(59,130,246)")).toBe(true);
    expect(colorEquals("rgba(0,0,0,1)", "#000000")).toBe(true);
  });
  it("unequal for different colours / different alpha", () => {
    expect(colorEquals("#3b82f6", "#3b82f7")).toBe(false);
    expect(colorEquals("rgba(0,0,0,0.5)", "#000000")).toBe(false);
  });
  it("false on unparseable (fail-closed for a label filter)", () => {
    expect(colorEquals("var(--x)", "#000")).toBe(false);
  });
  it("fails closed on invalid/out-of-range tokens (review round 1)", () => {
    expect(colorEquals("rgb(59px, 130, 246)", "#3b82f6")).toBe(false);
    expect(colorEquals("rgb(Infinity,0,0)", "#ff0000")).toBe(false);
    expect(colorEquals("rgb(300,300,300)", "#ffffff")).toBe(false);
    expect(colorEquals("hsl(0,50%%,50%)", "#bf4040")).toBe(false);
    expect(colorEquals("rgb(255,255,255)", "#ffffff")).toBe(true);
  });
  it("accepts idiomatic CSS number formats without regressing rejects (review round 2)", () => {
    expect(colorEquals("rgba(0,0,0,.5)", "rgba(0,0,0,0.5)")).toBe(true);
    expect(colorEquals("rgb(+59,130,246)", "#3b82f6")).toBe(true);
    expect(colorEquals("rgb(59.,130,246)", "#3b82f6")).toBe(true);
    expect(colorEquals("rgb(59px,130,246)", "#3b82f6")).toBe(false);
    expect(colorEquals("rgb(Infinity,0,0)", "#ff0000")).toBe(false);
    expect(colorEquals("rgb(300,300,300)", "#ffffff")).toBe(false);
  });
  it("is independent of Lyse's resolver/parser (no import)", () => {
    const src = readFileSync(new URL("./color-eq.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/graph\/resolve/);
    expect(src).not.toMatch(/a11y\/contrast/);
  });
});

describe("OKLCH", () => {
  it("parses OKLCH and equals the sRGB hex it converts to", () => {
    // @workday/canvas-tokens-web base.orange400 = oklch(0.7261 0.1852 52.58 / 1) = #fd7e00
    expect(colorEquals("oklch(0.7261 0.1852 52.58 / 1)", "#fd7e00")).toBe(true);
    expect(colorEquals("oklch(72.61% 0.1852 52.58)", "#fd7e00")).toBe(true); // %-lightness form
  });
  it("isColorLiteral accepts OKLCH, rejects garbage", () => {
    expect(isColorLiteral("oklch(0.7261 0.1852 52.58 / 1)")).toBe(true);
    expect(isColorLiteral("oklch(nope)")).toBe(false);
    expect(isColorLiteral("oklch(0.7 0.1)")).toBe(false); // needs 3 coords
  });
  it("uses strict equality — a 1-unit-off hex does NOT equal the OKLCH (no tolerance)", () => {
    expect(colorEquals("oklch(0.7261 0.1852 52.58 / 1)", "#fd7e01")).toBe(false);
  });
});
