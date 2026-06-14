import { describe, it, expect } from "vitest";
import { spearmanRho } from "./correlation.js";

describe("spearmanRho", () => {
  it("returns 1 for a perfectly increasing monotonic relation", () => {
    expect(spearmanRho([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 10);
  });

  it("returns -1 for a perfectly decreasing monotonic relation", () => {
    expect(spearmanRho([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1, 10);
  });

  it("matches the no-ties shortcut on a known example (0.8)", () => {
    // x=[1..5], y=[1,3,2,5,4]; Σd²=4 → 1 - 6·4/(5·24) = 0.8
    expect(spearmanRho([1, 2, 3, 4, 5], [1, 3, 2, 5, 4])).toBeCloseTo(0.8, 10);
  });

  it("handles ties via average ranks (rank-then-Pearson)", () => {
    // x=[1,1,2] → ranks [1.5,1.5,3]; y=[1,2,3] → ranks [1,2,3]
    // Pearson of those = 1.5/sqrt(3) ≈ 0.8660254
    expect(spearmanRho([1, 1, 2], [1, 2, 3])).toBeCloseTo(0.8660254, 6);
  });

  it("stays within [-1, 1] and finite on a tie-heavy ordinal anchor", () => {
    const kavcic = [0, 0, 1, 2, 2, 3, 4, 5];
    const lyse = [12, 20, 31, 45, 40, 60, 78, 88];
    const rho = spearmanRho(kavcic, lyse);
    expect(Number.isFinite(rho)).toBe(true);
    expect(rho).toBeGreaterThanOrEqual(-1);
    expect(rho).toBeLessThanOrEqual(1);
    expect(rho).toBeGreaterThan(0.9); // strongly monotonic here
  });

  it("throws on length mismatch", () => {
    expect(() => spearmanRho([1, 2], [1, 2, 3])).toThrow();
  });

  it("returns NaN for n < 2 (undefined correlation)", () => {
    expect(Number.isNaN(spearmanRho([1], [2]))).toBe(true);
    expect(Number.isNaN(spearmanRho([], []))).toBe(true);
  });

  it("returns NaN when one series has zero variance (all ties)", () => {
    expect(Number.isNaN(spearmanRho([3, 3, 3], [1, 2, 3]))).toBe(true);
  });
});
