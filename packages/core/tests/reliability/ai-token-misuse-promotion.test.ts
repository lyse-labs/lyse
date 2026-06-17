import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// #78 — ai-token-misuse promoted into v1 after clearing both gates on the
// 2026-06-17 synthetic recall-suite run: recall LB 0.912 (40/40), precision LB
// 0.901 (35/35).
describe("v1 promotion of ai-token-misuse (#78)", () => {
  it("is in the trusted v1 stable set with both LBs >= 0.90", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.has("ai-governance.ai-token-misuse")).toBe(true);
    const sa = SUB_AXES.find((s) => s.id === "ai-governance.ai-token-misuse")!;
    expect(sa.status).toBe("stable");
    expect(sa.contributesToScore).toBe(true);
    expect(sa.deterministicValidator).toBe(true);
    expect(sa.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    expect(sa.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
  });

  it("brings the trusted stable set to 26 sub-axes", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.size).toBe(26);
  });
});
