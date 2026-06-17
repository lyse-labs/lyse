import { describe, it, expect } from "vitest";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";
import { resolveStableSubAxes } from "../../src/reliability/score/stable-sub-axes.js";

// 2026-06-17 batch promotion — 5 already-shipped deterministic rules that had no
// recall generators (so were stuck experimental) were measured and cleared both
// gates (recall LB 0.901, precision LB 0.904 each).
const PROMOTED = [
  "a11y.prefers-reduced-motion",
  "a11y.focus-visible",
  "a11y.inclusive-language",
  "tokens.responsive-breakpoints",
  "components.no-icon-fonts",
];

describe("batch promotion of 5 deterministic experimental rules", () => {
  it("each is now in the trusted v1 stable set with both LBs >= 0.90", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    for (const id of PROMOTED) {
      expect(v1.has(id), `${id} not in stable set`).toBe(true);
      const sa = SUB_AXES.find((s) => s.id === id)!;
      expect(sa.status).toBe("stable");
      expect(sa.contributesToScore).toBe(true);
      expect(sa.deterministicValidator).toBe(true);
      expect(sa.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
      expect(sa.precisionWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("brings the trusted stable set to ≥ 33 sub-axes", () => {
    const v1 = resolveStableSubAxes(SUB_AXES, { filterRan: false });
    expect(v1.size).toBeGreaterThanOrEqual(33);
  });
});
