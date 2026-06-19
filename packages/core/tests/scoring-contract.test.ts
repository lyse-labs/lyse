import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { CURRENT_SCORING_VERSION } from "../src/reliability/score/version-pin.js";

// Repo root from packages/core/tests/ → up 3 (tests → core → packages → root).
const FULL_DS = join(import.meta.dirname, "..", "..", "..", "fixtures", "full-ds");

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
