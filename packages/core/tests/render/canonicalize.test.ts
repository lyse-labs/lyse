import { describe, it, expect } from "vitest";
import { canonicalize } from "../../src/render/canonicalize.js";

describe("canonicalize", () => {
  it("hex and rgb sRGB collapse to the same canonical rgb()", () => {
    expect(canonicalize("#ffffff")).toEqual({ kind: "color", canonical: "rgb(255, 255, 255)" });
    expect(canonicalize("#fff").canonical).toBe("rgb(255, 255, 255)");
    expect(canonicalize("rgb(255, 255, 255)").canonical).toBe("rgb(255, 255, 255)");
  });
  it("px lengths are normalized", () => {
    expect(canonicalize("16px")).toEqual({ kind: "length", canonical: "16px" });
    expect(canonicalize(" 16px ").canonical).toBe("16px");
  });
  it("oklch/lab/percent are skipped (not canonicalizable)", () => {
    expect(canonicalize("oklch(0.7 0.1 200)").kind).toBe("skip");
    expect(canonicalize("50%").kind).toBe("skip");
  });
});
