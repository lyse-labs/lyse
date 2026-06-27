import { describe, it, expect } from "vitest";
import { renderSloRow } from "../../../../scripts/render-coverage.js";
import type { SubAxisRecord } from "../../src/reliability/types.js";

const base: SubAxisRecord = {
  id: "tokens.spacing", axis: "tokens", name: "Spacing", status: "stable",
  precisionMeasured: 0.99, recallMeasured: 1,
  precisionWilsonLowerBound: 0.985, recallWilsonLowerBound: 0.90,
  nSamples: 142, lastCalibrated: "2026-06-18T00:00:00.000Z",
  contributesToScore: true, ruleIds: ["tokens/no-hardcoded-spacing"], llmDriven: false,
};

describe("per-rule SLO N column", () => {
  it("renders the real sample count, not a dash", () => {
    const row = renderSloRow(base);
    expect(row).toContain("| 142 |");
    expect(row).not.toMatch(/\|\s*—\s*\| 2026-06-18/); // N is not a dash
  });
});
