import { describe, it } from "vitest";
import fc from "fast-check";
import { computeScoreV1 } from "../formula-v1.js";
import type { Finding } from "../../types.js";

/**
 * Property-based hardening of the trusted score (#104) — computeScoreV1.
 */

const SUB_AXES = [
  "tokens.color",
  "tokens.spacing",
  "a11y.essentials",
  "ai-governance.ai-content-live-region",
  "ai-governance.feedback-control-present",
  "components.no-native-shadows",
];

const findingArb: fc.Arbitrary<Finding> = fc.record({
  ruleId: fc.constant("x/y"),
  subAxisId: fc.constantFrom(...SUB_AXES),
  severity: fc.constantFrom("error", "warning", "info") as fc.Arbitrary<Finding["severity"]>,
  confidence: fc.constant("high") as fc.Arbitrary<Finding["confidence"]>,
  message: fc.constant(""),
  file: fc.constant("f.tsx"),
  line: fc.nat({ max: 999 }),
  column: fc.constant(null),
});

const findingsArb = fc.array(findingArb, { maxLength: 40 });
const stableArb = fc.subarray(SUB_AXES).map((xs) => new Set(xs));
const confArb = fc.constant(Object.fromEntries(SUB_AXES.map((s) => [s, 1.0])));

describe("computeScoreV1 property invariants (#104)", () => {
  it("score is an integer in [0,100]", () => {
    fc.assert(
      fc.property(findingsArb, stableArb, confArb, (findings, stable, conf) => {
        const r = computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf });
        return Number.isInteger(r.score) && r.score >= 0 && r.score <= 100;
      }),
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(findingsArb, stableArb, confArb, (findings, stable, conf) => {
        return (
          computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf }).score ===
          computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf }).score
        );
      }),
    );
  });

  it("counted + reportedOnly always equals the finding count", () => {
    fc.assert(
      fc.property(findingsArb, stableArb, confArb, (findings, stable, conf) => {
        const r = computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf });
        return r.findingsCountedInScore + r.findingsReportedOnly === findings.length;
      }),
    );
  });

  it("grace ≤ 1 never lowers the score (lower factor → higher-or-equal)", () => {
    fc.assert(
      fc.property(
        findingsArb,
        stableArb,
        confArb,
        fc.float({ min: 0, max: 1, noNaN: true }),
        (findings, stable, conf, g) => {
          const graced = computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: g });
          const full = computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: 1 });
          return graced.score >= full.score;
        },
      ),
    );
  });

  it("grace=1 is inert (identical to omitting it)", () => {
    fc.assert(
      fc.property(findingsArb, stableArb, confArb, (findings, stable, conf) => {
        return (
          computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf }).score ===
          computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: 1 }).score
        );
      }),
    );
  });

  it("grace does nothing when no ai-governance finding is counted", () => {
    const nonGov = SUB_AXES.filter((s) => !s.startsWith("ai-governance."));
    const nonGovFindingArb = findingArb.filter((f) => !f.subAxisId.startsWith("ai-governance."));
    fc.assert(
      fc.property(
        fc.array(nonGovFindingArb, { maxLength: 40 }),
        fc.float({ min: 0, max: 1, noNaN: true }),
        (findings, g) => {
          const stable = new Set(nonGov);
          const conf = Object.fromEntries(nonGov.map((s) => [s, 1.0]));
          const a = computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: g });
          const b = computeScoreV1({ findings, stableSubAxes: stable, confidenceByAxis: conf, aiGovernanceGrace: 1 });
          return a.score === b.score;
        },
      ),
    );
  });
});
