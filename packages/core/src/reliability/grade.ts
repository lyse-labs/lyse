import type { Grade, GradeResult } from "../types.js";

/**
 * A/B/C/Fail letter grade over the canonical Health Score (#87).
 *
 * The auto-fail logic (>=2 axes scored 0) now lives in scorer.ts, which caps
 * `finalScore` into the Fail band (<=39) and carries `autoFail` on the result.
 * `computeGrade` is therefore a pure band lookup + flag passthrough — the
 * number, tier, and grade are guaranteed consistent by construction.
 */

// Band lower bounds, aligned with the CMMI tier boundaries in scorer.ts.
function bandGrade(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "Fail";
}

export function computeGrade(
  finalScore: number | "N/A",
  autoFail?: { reasons: string[] },
): GradeResult {
  if (finalScore === "N/A") {
    return { grade: "N/A", autoFailed: false, reasons: [] };
  }
  return {
    grade: bandGrade(finalScore),
    autoFailed: autoFail !== undefined,
    reasons: autoFail?.reasons ?? [],
  };
}
