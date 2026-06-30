import { describe, it, expect } from "vitest";
import { shouldPromote } from "../../src/reliability/catalogue/promotion.js";

describe("promotion precision gate", () => {
  it("rejects when precision is below 0.90 even if recall clears", () => {
    expect(shouldPromote({ successes: 40, trials: 40, minSamples: 30, threshold: 0.90, precisionMeasured: 0.44 })).toBe(false);
  });
  it("accepts when precision, N and recall all clear", () => {
    expect(shouldPromote({ successes: 40, trials: 40, minSamples: 30, threshold: 0.90, precisionMeasured: 0.95 })).toBe(true);
  });
  it("rejects when precision is missing (unmeasured)", () => {
    expect(shouldPromote({ successes: 40, trials: 40, minSamples: 30, threshold: 0.90, precisionMeasured: null })).toBe(false);
  });
});
