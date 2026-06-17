import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// #81 — draft-attribution promoted into v1 after clearing both gates on the
// 2026-06-17 synthetic recall-suite run: recall LB 0.901, precision LB 0.901.
describe("v1 promotion of draft-attribution (#81)", () => {
  it("is in the trusted v1 stable set with both LBs >= 0.90", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.has("ai-governance.draft-attribution")).toBe(true);
    const sa = SUB_AXES.find((s) => s.id === "ai-governance.draft-attribution")!;
    expect(sa.status).toBe("stable");
    expect(sa.contributesToScore).toBe(true);
    expect(sa.deterministicValidator).toBe(true);
    expect(sa.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    expect(sa.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
  });

  it("is counted in the trusted stable set (≥ 28)", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.size).toBeGreaterThanOrEqual(28);
  });
});
