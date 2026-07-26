import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { colorEquals } from "./color-eq.js";

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
  it("is independent of Lyse's resolver/parser (no import)", () => {
    const src = readFileSync(new URL("./color-eq.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/graph\/resolve/);
    expect(src).not.toMatch(/a11y\/contrast/);
  });
});
