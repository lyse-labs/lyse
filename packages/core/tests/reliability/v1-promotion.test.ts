import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// The 10 deterministic gate-clearers promoted into the trusted v1 score
// (recall LB and precision LB both >= 0.90 on the 2026-06-17 synthetic run).
const PROMOTED = [
  "tokens.description-coverage",
  "components.native-shadows",
  "components.naming-component-pascalcase",
  "components.naming-hook-prefix",
  "stories.coverage",
  "ai-surface.agents-md-quality",
  "ai-governance.ai-marker-component-present",
  "ai-governance.ai-loading-error-states",
  "ai-governance.ai-content-live-region",
  "ai-governance.feedback-control-present",
];

describe("v1 promotion of the 10 deterministic gate-clearers (#71)", () => {
  it("each promoted sub-axis is now in the trusted v1 stable set", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) expect(v1.has(id)).toBe(true);
  });

  it("each promoted sub-axis is status:stable + contributesToScore + a deterministic validator with both LBs >= 0.90", () => {
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

  it("the trusted stable set is now 22 sub-axes (12 original + 10 promoted)", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.size).toBe(22);
  });
});
