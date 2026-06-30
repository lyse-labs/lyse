import { describe, it, expect } from "vitest";
import { deriveMeasurement } from "../../src/reliability/catalogue/measure.js";

describe("deriveMeasurement", () => {
  it("computes precision, recall, Wilson LBs and N from a matrix", () => {
    const m = deriveMeasurement({ tp: 9, fp: 1, tn: 20, fn: 0 });
    expect(m.precisionMeasured).toBeCloseTo(0.9, 10);
    expect(m.recallMeasured).toBe(1);
    expect(m.nSamples).toBe(30);
    expect(m.precisionWilsonLowerBound).toBeGreaterThan(0);
    expect(m.precisionWilsonLowerBound).toBeLessThan(0.9);
  });

  it("returns null precision when there are no positive predictions", () => {
    const m = deriveMeasurement({ tp: 0, fp: 0, tn: 5, fn: 0 });
    expect(m.precisionMeasured).toBeNull();
    expect(m.recallMeasured).toBeNull();
    expect(m.nSamples).toBe(5);
  });
});
