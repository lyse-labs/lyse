import type { AxisScore, Grade, GradeResult } from "../types.js";

/**
 * A/B/C/Fail letter grade over the canonical Health Score, with deterministic
 * automatic-fail conditions (Track #87). Today the only statically-evaluable
 * auto-fail is "≥ 2 axes scored 0" — the roadmap's anchor-based conditions
 * (over-reliance ≤ 1, agent-expectations ≤ 1) require the 0–3 anchor model
 * (#86) / LLM rubric dimensions (#83) and are added when those land.
 */

// Band lower bounds, aligned with the CMMI tier boundaries in scorer.ts.
function bandGrade(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "Fail";
}

export function computeGrade(finalScore: number | "N/A", axes: AxisScore[]): GradeResult {
  const zeroAxes = axes
    .filter((a) => a.score === 0)
    .map((a) => a.axis)
    .sort((a, b) => a.localeCompare(b));

  if (zeroAxes.length >= 2) {
    return {
      grade: "Fail",
      autoFailed: true,
      reasons: [`${zeroAxes.length} axes scored 0: ${zeroAxes.join(", ")}`],
    };
  }

  if (finalScore === "N/A") {
    return { grade: "N/A", autoFailed: false, reasons: [] };
  }

  return { grade: bandGrade(finalScore), autoFailed: false, reasons: [] };
}
