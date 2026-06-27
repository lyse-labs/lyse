import { describe, expect, it } from "vitest";
import {
  cohenKappa,
  aggregateKappaByDimension,
} from "../kappa.js";
import { KAPPA_FIXTURES } from "../kappa-fixtures.js";

describe("cohenKappa", () => {
  it("returns 1.0 for perfect agreement (all-positive)", () => {
    const pairs = [
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(1.0, 10);
  });

  it("returns 1.0 for perfect agreement (mixed sign)", () => {
    const pairs = [
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: false, llmVerdict: false },
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(1.0, 10);
  });

  it("returns 0.0 for chance-level agreement (symmetric disagreement)", () => {
    const pairs = [
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: false, llmVerdict: false },
      { staticVerdict: true, llmVerdict: false },
      { staticVerdict: false, llmVerdict: true },
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(0.0, 10);
  });

  it("computes exact kappa = 0.4 for a 3-pair hand-computed case", () => {
    // N=3: agree=2 (TT, FF), disagree=1 (TF)
    // Po=2/3, Pe=4/9 → kappa=2/5=0.4 (exact fraction)
    const pairs = [
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: false, llmVerdict: false },
      { staticVerdict: true, llmVerdict: false },
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(0.4, 10);
  });

  it("returns 1.0 for degenerate all-agree-all-positive case (no variance)", () => {
    const pairs = [
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
      { staticVerdict: true, llmVerdict: true },
    ];
    expect(cohenKappa(pairs)).toBeCloseTo(1.0, 10);
  });

  it("returns 0.0 for empty pair list", () => {
    expect(cohenKappa([])).toBe(0);
  });
});

describe("aggregateKappaByDimension", () => {
  it("returns one entry per dimension, sorted by dimensionId", () => {
    const result = aggregateKappaByDimension(KAPPA_FIXTURES);
    const ids = result.map((r) => r.dimensionId);
    expect(ids).toEqual([...ids].sort());
  });

  it("high-agreement dimension yields kappa ≥ 0.8", () => {
    const result = aggregateKappaByDimension(KAPPA_FIXTURES);
    const high = result.find((r) => r.dimensionId === "high-agreement");
    expect(high).toBeDefined();
    expect(high!.kappa).toBeGreaterThanOrEqual(0.8);
  });

  it("low-agreement dimension yields kappa ≤ 0.2", () => {
    const result = aggregateKappaByDimension(KAPPA_FIXTURES);
    const low = result.find((r) => r.dimensionId === "low-agreement");
    expect(low).toBeDefined();
    expect(low!.kappa).toBeLessThanOrEqual(0.2);
  });

  it("each entry carries n, agreement, precision, recall, and Wilson LBs", () => {
    const result = aggregateKappaByDimension(KAPPA_FIXTURES);
    for (const entry of result) {
      expect(typeof entry.n).toBe("number");
      expect(typeof entry.agreement).toBe("number");
      expect(typeof entry.precision).toBe("number");
      expect(typeof entry.recall).toBe("number");
      expect(typeof entry.precisionWilsonLb).toBe("number");
      expect(typeof entry.recallWilsonLb).toBe("number");
    }
  });

  it("precision Wilson LB ≤ precision (bound is conservative)", () => {
    const result = aggregateKappaByDimension(KAPPA_FIXTURES);
    for (const entry of result) {
      expect(entry.precisionWilsonLb).toBeLessThanOrEqual(entry.precision + 1e-9);
      expect(entry.recallWilsonLb).toBeLessThanOrEqual(entry.recall + 1e-9);
    }
  });

  it("computes precision/recall from an asymmetric fixture (static=prediction, llm=reference)", () => {
    // staticVerdict = prediction; llmVerdict = reference/ground-truth.
    //   tp = static && llm                 = 1
    //   fp = static && !llm (predicted-pos, ref-neg) = 2
    //   fn = !static && llm (predicted-neg, ref-pos) = 1
    // precision = tp/(tp+fp) = 1/3 ; recall = tp/(tp+fn) = 1/2
    const pairs = [
      { dimensionId: "asym", staticVerdict: true, llmVerdict: true }, // tp
      { dimensionId: "asym", staticVerdict: true, llmVerdict: false }, // fp
      { dimensionId: "asym", staticVerdict: true, llmVerdict: false }, // fp
      { dimensionId: "asym", staticVerdict: false, llmVerdict: true }, // fn
    ];
    const [entry] = aggregateKappaByDimension(pairs);
    expect(entry).toBeDefined();
    expect(entry!.precision).toBeCloseTo(1 / 3, 10);
    expect(entry!.recall).toBeCloseTo(1 / 2, 10);
  });
});
