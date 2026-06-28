import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";

describe("sub-axes nSamples", () => {
  it("every sub-axis with nSamples set declares a non-negative number", () => {
    for (const s of SUB_AXES) {
      if (s.nSamples !== undefined) {
        expect(typeof s.nSamples, `${s.id} nSamples must be a number`).toBe("number");
        expect(s.nSamples).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
