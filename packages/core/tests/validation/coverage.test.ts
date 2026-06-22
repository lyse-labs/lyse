import { describe, it, expect } from "vitest";
import { coverageGaps, ADDRESSABLE_PENDING, JUDGMENT_RULES } from "../../validation/coverage.js";

describe("coverage completeness gate", () => {
  it("every registry rule is either oracle-covered or explicitly classified", () => {
    const { uncovered } = coverageGaps();
    expect(uncovered).toEqual([]);
  });

  it("ADDRESSABLE_PENDING and JUDGMENT_RULES have no overlap", () => {
    const addressable = new Set(Object.keys(ADDRESSABLE_PENDING));
    const judgment = new Set(Object.keys(JUDGMENT_RULES));
    const overlap = [...addressable].filter((id) => judgment.has(id));
    expect(overlap).toEqual([]);
  });
});
