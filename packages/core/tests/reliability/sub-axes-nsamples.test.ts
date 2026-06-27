import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";

describe("sub-axes nSamples", () => {
  it("every sub-axis declares a numeric nSamples", () => {
    for (const s of SUB_AXES) {
      expect(typeof s.nSamples, `${s.id} missing nSamples`).toBe("number");
      expect(s.nSamples).toBeGreaterThanOrEqual(0);
    }
  });
});
