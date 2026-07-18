import { describe, expect, it } from "vitest";
import { wilsonLowerBound, shouldPromote } from "../promotion.js";

describe("Wilson lower-bound", () => {
  it("matches reference values (Brown, Cai, DasGupta 2001)", () => {
    // 30 successes out of 30 trials, 95% confidence → ~0.88 LB
    const lb = wilsonLowerBound(30, 30, 0.95);
    expect(lb).toBeCloseTo(0.88, 1);
  });
  it("returns 0 for zero successes", () => {
    expect(wilsonLowerBound(0, 10, 0.95)).toBe(0);
  });
});

describe("shouldPromote", () => {
  it("promotes when Wilson LB ≥ 0.90 AND N ≥ 40 AND precision ≥ 0.90 (aligned with public claim)", () => {
    expect(shouldPromote({ successes: 30, trials: 30, precisionMeasured: 0.95 })).toBe(false); // N < 40 and LB ~0.88 < 0.90
    expect(shouldPromote({ successes: 50, trials: 50, precisionMeasured: 0.95 })).toBe(true);  // LB ~0.93
    expect(shouldPromote({ successes: 100, trials: 100, precisionMeasured: 0.95 })).toBe(true);
  });
  it("rejects N < 40 even with perfect rate", () => {
    expect(shouldPromote({ successes: 39, trials: 39, precisionMeasured: 0.95 })).toBe(false);
  });
});
