import { describe, it } from "vitest";
import fc from "fast-check";
import { score, type AxisFindings } from "../src/scorer.js";
import type { AxisName } from "../src/types.js";

/**
 * Property-based hardening of the v2 scorer (#104). These verify the
 * determinism + robustness invariants behind the public trust claims, beyond
 * the example-based tests in scorer.test.ts.
 */

const AXES: AxisName[] = ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"];

const axisFindingsArb = fc.record({
  errorCount: fc.nat({ max: 30 }),
  warningCount: fc.nat({ max: 30 }),
  infoCount: fc.nat({ max: 30 }),
});

// findings + opportunities maps over all axes. Opportunities biased toward > 0
// so at least one axis is usually active.
const inputArb = fc
  .tuple(
    fc.dictionary(fc.constantFrom(...AXES), axisFindingsArb, { minKeys: 0, maxKeys: 6 }),
    fc.dictionary(fc.constantFrom(...AXES), fc.nat({ max: 200 }), { minKeys: 0, maxKeys: 6 }),
  )
  .map(([f, o]) => {
    const findings = {} as Record<AxisName, AxisFindings>;
    const opp = {} as Record<AxisName, number>;
    for (const a of AXES) {
      findings[a] = f[a] ?? { errorCount: 0, warningCount: 0, infoCount: 0 };
      opp[a] = o[a] ?? 0;
    }
    return { findings, opp };
  });

describe("scorer property invariants (#104)", () => {
  it("final score is always an integer in [0,100] or N/A", () => {
    fc.assert(
      fc.property(inputArb, ({ findings, opp }) => {
        const r = score(findings, opp);
        if (r.finalScore === "N/A") return true;
        return Number.isInteger(r.finalScore) && r.finalScore >= 0 && r.finalScore <= 100;
      }),
    );
  });

  it("is deterministic — same input yields the same score", () => {
    fc.assert(
      fc.property(inputArb, ({ findings, opp }) => {
        const a = score(findings, opp);
        const b = score(findings, opp);
        return a.finalScore === b.finalScore && a.tier === b.tier;
      }),
    );
  });

  it("every per-axis score is an integer in [0,100] or N/A", () => {
    fc.assert(
      fc.property(inputArb, ({ findings, opp }) => {
        const r = score(findings, opp);
        return r.axes.every(
          (a) => a.score === "N/A" || (Number.isInteger(a.score) && a.score >= 0 && a.score <= 100),
        );
      }),
    );
  });

  it("an axis with zero opportunities is always N/A (never scored)", () => {
    fc.assert(
      fc.property(inputArb, ({ findings, opp }) => {
        const r = score(findings, opp);
        return r.axes.every((a) => (opp[a.axis] === 0 ? a.score === "N/A" : a.score !== "N/A"));
      }),
    );
  });

  it("grace never LOWERS the score (a graced ai-governance axis ≥ ungraced)", () => {
    fc.assert(
      fc.property(inputArb, fc.float({ min: 0, max: Math.fround(0.999), noNaN: true }), ({ findings, opp }, g) => {
        const full = score(findings, opp, { aiGovernanceGrace: 1 });
        const graced = score(findings, opp, { aiGovernanceGrace: g });
        if (full.finalScore === "N/A" || graced.finalScore === "N/A") return true;
        return graced.finalScore >= full.finalScore;
      }),
    );
  });

  it("grace=1 is inert (identical to no options)", () => {
    fc.assert(
      fc.property(inputArb, ({ findings, opp }) => {
        return score(findings, opp).finalScore === score(findings, opp, { aiGovernanceGrace: 1 }).finalScore;
      }),
    );
  });

  it("grace does not change the score when there are no ai-governance findings", () => {
    fc.assert(
      fc.property(inputArb, fc.float({ min: 0, max: 1, noNaN: true }), ({ findings, opp }, g) => {
        findings["ai-governance"] = { errorCount: 0, warningCount: 0, infoCount: 0 };
        const a = score(findings, opp, { aiGovernanceGrace: g });
        const b = score(findings, opp, { aiGovernanceGrace: 1 });
        return a.finalScore === b.finalScore;
      }),
    );
  });

  it("monotonic: adding weighted findings to an ACTIVE axis never raises the final score", () => {
    fc.assert(
      fc.property(
        inputArb,
        fc.constantFrom(...AXES),
        fc.nat({ max: 20 }),
        ({ findings, opp }, axis, extra) => {
          if (opp[axis] === 0) return true; // inactive → adding findings keeps it N/A
          const base = score(findings, opp);
          const more = {
            ...findings,
            [axis]: { ...findings[axis], errorCount: findings[axis].errorCount + extra },
          };
          const after = score(more, opp);
          if (base.finalScore === "N/A" || after.finalScore === "N/A") return true;
          return after.finalScore <= base.finalScore;
        },
      ),
    );
  });
});
