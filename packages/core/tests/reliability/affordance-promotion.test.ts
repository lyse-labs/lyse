import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// #134 — the 3 new deterministic AI-governance affordance sub-axes, promoted
// into the trusted v1 score after clearing both gates (recall LB and precision
// LB both 0.901 on the 2026-06-17 synthetic recall-suite run).
const PROMOTED = [
  "ai-governance.confidence-indicator-present",
  "ai-governance.source-attribution-present",
  "ai-governance.bot-identity-labeling",
];

describe("v1 promotion of the 3 AI-governance affordance rules (#134)", () => {
  it("each is now in the trusted v1 stable set", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) expect(v1.has(id)).toBe(true);
  });

  it("each is status:stable + contributesToScore + deterministic with both LBs >= 0.90", () => {
    for (const id of PROMOTED) {
      const sa = SUB_AXES.find((s) => s.id === id);
      expect(sa, `missing sub-axis ${id}`).toBeDefined();
      expect(sa!.status).toBe("stable");
      expect(sa!.contributesToScore).toBe(true);
      expect(sa!.deterministicValidator).toBe(true);
      expect(sa!.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
      expect(sa!.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("all 3 affordance rules are in the trusted stable set (≥ 25 — later cohorts add more)", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) expect(v1.has(id)).toBe(true);
    expect(v1.size).toBeGreaterThanOrEqual(25);
  });
});
