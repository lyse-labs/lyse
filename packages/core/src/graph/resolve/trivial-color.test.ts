import { describe, it, expect } from "vitest";
import { isTrivialColor } from "./trivial-color.js";

describe("isTrivialColor", () => {
  it("is true for every representation of pure white", () => {
    for (const v of ["#fff", "#ffffff", "#FFFFFF", "rgb(255,255,255)", "rgb(255 255 255)", "rgba(255,255,255,1)", "hsl(0,0%,100%)", "white"]) {
      expect(isTrivialColor(v)).toBe(true);
    }
  });

  it("is true for every representation of pure black", () => {
    for (const v of ["#000", "#000000", "rgb(0,0,0)", "rgba(0,0,0,1)", "hsl(0,0%,0%)", "black"]) {
      expect(isTrivialColor(v)).toBe(true);
    }
  });

  it("is true for fully-transparent values (alpha 0), regardless of rgb", () => {
    for (const v of ["rgba(0,0,0,0)", "rgba(255,255,255,0)", "#ffffff00", "#00000000"]) {
      expect(isTrivialColor(v)).toBe(true);
    }
  });

  it("is false for real colours and near-white/near-black", () => {
    for (const v of ["#fffffe", "#010000", "#e5e7eb", "#5865f2", "rgb(1,1,1)", "hsl(210,50%,50%)"]) {
      expect(isTrivialColor(v)).toBe(false);
    }
  });

  it("is false for translucent (partial-alpha) white/black — strict, not fuzzy", () => {
    for (const v of ["rgba(255,255,255,0.5)", "rgba(0,0,0,0.15)", "#ffffff80"]) {
      expect(isTrivialColor(v)).toBe(false);
    }
  });

  it("fails open: an unparseable value is not trivial", () => {
    for (const v of ["", "not-a-color", "var(--x)", "linear-gradient(red, blue)"]) {
      expect(isTrivialColor(v)).toBe(false);
    }
  });
});
