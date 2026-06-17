import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// #82 — interaction-pattern-docs promoted into v1 after clearing both gates on
// the 2026-06-17 synthetic recall-suite run: recall LB 0.901, precision LB 0.901.
describe("v1 promotion of interaction-pattern-docs (#82)", () => {
  it("is in the trusted v1 stable set with both LBs >= 0.90", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.has("ai-governance.interaction-pattern-docs")).toBe(true);
    const sa = SUB_AXES.find((s) => s.id === "ai-governance.interaction-pattern-docs")!;
    expect(sa.status).toBe("stable");
    expect(sa.contributesToScore).toBe(true);
    expect(sa.deterministicValidator).toBe(true);
    expect(sa.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    expect(sa.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
  });

  it("brings the trusted stable set to 27 sub-axes", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.size).toBe(27);
  });
});
