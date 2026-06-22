import { describe, it, expect } from "vitest";
import { youdensJ, emptyMatrix, addObservation } from "../../validation/score.js";

describe("youdensJ", () => {
  it("perfect detector scores 1", () => {
    expect(youdensJ({ tp: 5, fp: 0, tn: 5, fn: 0 })).toBe(1);
  });
  it("coin-flip / flag-everything scores 0", () => {
    // flags everything: tp=5, fn=0, but fp=5, tn=0 → sens 1 + spec 0 - 1 = 0
    expect(youdensJ({ tp: 5, fp: 5, tn: 0, fn: 0 })).toBe(0);
  });
  it("returns 0 when a denominator is empty (no positives or no negatives)", () => {
    expect(youdensJ({ tp: 0, fp: 0, tn: 3, fn: 0 })).toBe(0);
  });
});

describe("matrix accumulation", () => {
  it("classifies observations into the right cell", () => {
    let m = emptyMatrix();
    m = addObservation(m, true, true);   // positive label, flagged → TP
    m = addObservation(m, true, false);  // positive label, missed → FN
    m = addObservation(m, false, true);  // negative label, flagged → FP
    m = addObservation(m, false, false); // negative label, clean → TN
    expect(m).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
  });
});
