import { describe, it, expect } from "vitest";
import { bucketKey, gateEligibleFor, type LedgerBucket } from "./bucket.js";

const base: Omit<LedgerBucket, "gateEligible"> = {
  ruleId: "tokens/no-hardcoded-color", class: "exact", zone: "app",
  n: 42, precision: 0.976, precisionWilsonLB: 0.91,
  recall: null, recallWilsonLB: null, labelSource: "auto",
};

describe("bucketKey", () => {
  it("is stable and delimiter-safe", () => {
    expect(bucketKey("tokens/no-hardcoded-color", "exact", "app"))
      .toBe(bucketKey("tokens/no-hardcoded-color", "exact", "app"));
    expect(bucketKey("a", "exact", "app")).not.toBe(bucketKey("a", "near", "app"));
  });
});

describe("gateEligibleFor", () => {
  it("is true only for deterministic auto + n>=35 + wilsonLB>=0.90", () => {
    expect(gateEligibleFor(base)).toBe(true);
  });
  it("is false when labelSource is not auto, whatever the numbers", () => {
    expect(gateEligibleFor({ ...base, labelSource: "llm-provisional" })).toBe(false);
    expect(gateEligibleFor({ ...base, labelSource: "human-validated" })).toBe(false);
  });
  it("is false when n<35 even at perfect precision", () => {
    expect(gateEligibleFor({ ...base, n: 34, precision: 1, precisionWilsonLB: 0.95 })).toBe(false);
  });
  it("is false when wilsonLB<0.90", () => {
    expect(gateEligibleFor({ ...base, precisionWilsonLB: 0.899 })).toBe(false);
  });
  it("is false when precisionWilsonLB is null (unmeasured)", () => {
    expect(gateEligibleFor({ ...base, precision: null, precisionWilsonLB: null })).toBe(false);
  });
});
