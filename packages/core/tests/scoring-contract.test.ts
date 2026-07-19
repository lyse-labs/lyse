import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { CURRENT_SCORING_VERSION } from "../src/reliability/score/version-pin.js";

// fixtures/full-ds is under packages/core/ → up 1 (tests → core), then fixtures/.
// (Was 3-up → nonexistent <repo-root>/fixtures/full-ds, an empty-dir audit; the
// locked rows below now measure the REAL fixture — see the scoring-v1.1 note.)
const FULL_DS = join(import.meta.dirname, "..", "fixtures", "full-ds");

// The versioned v1 scoring contract. RULE: a change to a score output is
// semver-major. To change it, bump CURRENT_SCORING_VERSION and ADD a new entry
// here keyed by the new version — NEVER silently edit an existing version's
// locked values. The test below turns a silent change into a CI failure.
const LOCKED: Record<
  string,
  {
    finalScore: number | "N/A";
    tier: string;
    grade: { grade: string; autoFailed: boolean; reasons: string[] };
    axes: { axis: string; score: number | "N/A" }[];
  }
> = {
  "scoring-v1": {
    finalScore: 33,
    tier: "Managed",
    grade: { grade: "Fail", autoFailed: true, reasons: ["2 axes scored 0: ai-surface, tokens"] },
    axes: [
      { axis: "tokens", score: 0 },
      { axis: "a11y", score: "N/A" },
      { axis: "components", score: 100 },
      { axis: "stories", score: "N/A" },
      { axis: "ai-surface", score: 0 },
      { axis: "ai-governance", score: "N/A" },
    ],
  },
  // BUG FIX (not score drift): the previous scoring-v1.1 row (finalScore 33,
  // components 100, a11y/ai-governance N/A) measured a NONEXISTENT dir
  // (empty-dir audit) via a 3-up FULL_DS path. With the path corrected to the
  // real fixture, these are the v2 formula's REAL output — the formula is
  // unchanged. Reproduced by `--score-model v2` (Task 10's escape-hatch test).
  "scoring-v1.1": {
    finalScore: 37,
    tier: "Managed",
    grade: { grade: "Fail", autoFailed: true, reasons: ["2 axes scored 0: ai-surface, tokens"] },
    axes: [
      { axis: "tokens", score: 0 },
      { axis: "a11y", score: 33 },
      { axis: "components", score: 50 },
      { axis: "stories", score: "N/A" },
      { axis: "ai-surface", score: 0 },
      { axis: "ai-governance", score: 100 },
    ],
  },
  // Scoring v3 is now the default. Every full-ds axis has <30 opportunities, so
  // the min-N=30 gate N/A's each axis and the finalScore — the intended min-N
  // behavior on a tiny synthetic fixture (real repos clear 30/axis).
  "scoring-v3": {
    finalScore: "N/A",
    tier: "N/A",
    grade: { grade: "N/A", autoFailed: false, reasons: [] },
    axes: [
      { axis: "tokens", score: "N/A" },
      { axis: "a11y", score: "N/A" },
      { axis: "components", score: "N/A" },
      { axis: "stories", score: "N/A" },
      { axis: "ai-surface", score: "N/A" },
      { axis: "ai-governance", score: "N/A" },
    ],
  },
};

describe("scoring contract — semver gate (#90)", () => {
  it("declares the current scoring version in the audit output", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    expect(result.scoringVersion).toBe(CURRENT_SCORING_VERSION);
  });

  it("fixtures/full-ds matches the locked contract for the current scoring version", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
    const actual = {
      finalScore: result.finalScore,
      tier: result.tier,
      grade: result.grade,
      axes: result.axes.map((a) => ({ axis: a.axis, score: a.score })),
    };

    const locked = LOCKED[CURRENT_SCORING_VERSION];
    expect(
      locked,
      `No locked contract for scoring version "${CURRENT_SCORING_VERSION}". If you bumped the version, ADD its entry to LOCKED in this file.`,
    ).toBeDefined();

    expect(
      actual,
      `full-ds score output changed under "${CURRENT_SCORING_VERSION}". A score change is semver-major: bump CURRENT_SCORING_VERSION and add a NEW LOCKED entry (do not edit an existing version's values), or revert the change.`,
    ).toEqual(locked);
  });
});
