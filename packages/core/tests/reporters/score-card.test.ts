import { describe, it, expect } from "vitest";
import { renderScoreCard } from "../../src/reporters/score-card.js";
import type { AuditResult } from "../../src/types.js";

const result = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.1.0", scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "2026-05-15T14:23:00.000Z", stack: [], finalScore: 43,
  grade: { grade: "B", autoFailed: false },
  axes: [
    { axis: "tokens", score: 31, findings: 247, opportunities: 358 },
    { axis: "a11y", score: 62, findings: 41, opportunities: 108 },
    { axis: "components", score: 38, findings: 89, opportunities: 143 },
    { axis: "stories", score: 47, findings: 56, opportunities: 105 },
    { axis: "ai-surface", score: 55, findings: 3, opportunities: 8 },
    { axis: "ai-governance", score: "N/A", findings: 0, opportunities: 0 },
  ],
  findings: [],
} as unknown as AuditResult;

const opts = { mode: "default", color: false, unicode: false, width: 80, outDir: undefined, fileCount: 0, durationMs: 0, cwd: "/tmp" } as const;

describe("renderScoreCard", () => {
  it("renders a closed ascii box of uniform width", () => {
    const lines = renderScoreCard(result, { ...opts });
    expect(lines[0]!.startsWith("+")).toBe(true);
    expect(lines[0]!.endsWith("+")).toBe(true);
    expect(lines.at(-1)!.startsWith("+")).toBe(true);
    const w = lines[0]!.length;
    expect(w).toBeLessThanOrEqual(64);
    for (const l of lines) expect(l.length).toBe(w);
    for (const l of lines.slice(1, -1)) {
      expect(l.startsWith("|")).toBe(true);
      expect(l.endsWith("|")).toBe(true);
    }
  });
  it("renders rounded unicode borders when unicode is on", () => {
    const lines = renderScoreCard(result, { ...opts, unicode: true });
    expect(lines[0]!.startsWith("╭")).toBe(true);
    expect(lines.at(-1)!.startsWith("╰")).toBe(true);
  });
  it("shows grade, score, subtitle, and all six axes", () => {
    const text = renderScoreCard(result, { ...opts }).join("\n");
    expect(text).toContain("B  43/100");
    expect(text).toContain("design system health");
    for (const a of ["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"]) {
      expect(text).toContain(a);
    }
  });
  it("right-aligns the delta on the score row", () => {
    const lines = renderScoreCard(result, { ...opts }, "▼ 2");
    const scoreRow = lines.find((l) => l.includes("43/100"))!;
    expect(scoreRow).toContain("▼ 2");
    expect(scoreRow.indexOf("▼ 2")).toBeGreaterThan(scoreRow.indexOf("43/100"));
  });
  it("N/A final score renders without a crash and without a filled gauge", () => {
    // scorer.ts only returns finalScore "N/A" when every axis has 0 opportunities
    // (score "N/A"); mirror that invariant here rather than an unreachable mixed state.
    const naAxes = result.axes.map((a) => ({ ...a, score: "N/A" as const }));
    const text = renderScoreCard(
      { ...result, finalScore: "N/A", grade: { grade: "N/A", autoFailed: false }, axes: naAxes } as AuditResult,
      { ...opts },
    ).join("\n");
    expect(text).toContain("N/A");
    expect(text).not.toContain("#");
  });
  it("marks auto-fail after the grade", () => {
    const text = renderScoreCard({ ...result, finalScore: 0, grade: { grade: "Fail", autoFailed: true } } as AuditResult, { ...opts }).join("\n");
    expect(text).toContain("(auto-fail)");
  });
  it("clamps to narrow terminals without overflow", () => {
    const lines = renderScoreCard(result, { ...opts, width: 50 });
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(50);
  });
  it("emits no ANSI escapes when color is off", () => {
    const text = renderScoreCard(result, { ...opts }).join("\n");
    expect(text).not.toMatch(/\x1b/);
  });
});

describe("renderScoreCard — projection line", () => {
  const withProjection = {
    ...result,
    meta: {
      projection: {
        top: [
          { key: "tokens/no-hardcoded-color", ruleId: "tokens/no-hardcoded-color", count: 12, files: 8, gain: 8, migrationScale: false },
        ],
        totalGainTop3: 12,
      },
    },
  } as unknown as AuditResult;

  it("renders the projection line when totalGainTop3 > 0", () => {
    const text = renderScoreCard(withProjection, { ...opts }).join("\n");
    expect(text).toContain("^ fix the top 1 drift groups -> +12 pts");
  });

  it("uses the unicode glyph and arrow when unicode is on", () => {
    const text = renderScoreCard(withProjection, { ...opts, unicode: true }).join("\n");
    expect(text).toContain("↗ fix the top 1 drift groups → +12 pts");
  });

  it("omits the projection line when meta.projection is absent", () => {
    const text = renderScoreCard(result, { ...opts }).join("\n");
    expect(text).not.toContain("fix the top");
  });

  it("omits the projection line when totalGainTop3 is 0", () => {
    const zeroGain = {
      ...result,
      meta: {
        projection: {
          top: [{ key: "tokens/no-hardcoded-color", ruleId: "tokens/no-hardcoded-color", count: 12, files: 8, gain: 8, migrationScale: false }],
          totalGainTop3: 0,
        },
      },
    } as unknown as AuditResult;
    const text = renderScoreCard(zeroGain, { ...opts }).join("\n");
    expect(text).not.toContain("fix the top");
  });

  it("stays inside the box (uniform width) with the projection line present", () => {
    const lines = renderScoreCard(withProjection, { ...opts });
    const w = lines[0]!.length;
    for (const l of lines) expect(l.length).toBe(w);
  });

  it("fits the worst-case 3-digit gain at the narrowest box width (44) without overflow", () => {
    const worstCase = {
      ...result,
      meta: {
        projection: {
          top: [
            { key: "a", ruleId: "a", count: 1, files: 1, gain: 1, migrationScale: false },
            { key: "b", ruleId: "b", count: 1, files: 1, gain: 1, migrationScale: false },
            { key: "c", ruleId: "c", count: 1, files: 1, gain: 1, migrationScale: false },
          ],
          totalGainTop3: 100,
        },
      },
    } as unknown as AuditResult;
    const lines = renderScoreCard(worstCase, { ...opts, width: 44 });
    const w = lines[0]!.length;
    expect(w).toBeLessThanOrEqual(64);
    for (const l of lines) expect(l.length).toBe(w);
    const projLine = lines.find((l) => l.includes("fix the top"));
    expect(projLine).toBeDefined();
    expect(projLine).toContain("^ fix the top 3 drift groups -> +100 pts");
  });
});

// A perfect axis score printed next to a list of that axis's own findings reads
// as a straight contradiction. The score is right — the bare number is not.
describe("axes carrying findings the score ignores", () => {
  const withUnscored = {
    ...result,
    axes: [
      { axis: "tokens", score: "N/A", findings: 0, opportunities: 2, unscoredFindings: 0 },
      { axis: "a11y", score: 100, findings: 0, opportunities: 36, unscoredFindings: 15 },
      { axis: "components", score: 88, findings: 4, opportunities: 40, unscoredFindings: 0 },
      { axis: "stories", score: "N/A", findings: 0, opportunities: 0, unscoredFindings: 0 },
      { axis: "ai-surface", score: "N/A", findings: 0, opportunities: 8, unscoredFindings: 2 },
      { axis: "ai-governance", score: 100, findings: 0, opportunities: 84, unscoredFindings: 0 },
    ],
  } as unknown as AuditResult;

  it("never prints a bare 100 for an axis with unscored findings", () => {
    const lines = renderScoreCard(withUnscored, { ...opts });
    const a11y = lines.find((l) => l.includes("a11y"))!;
    expect(a11y).toContain("100");
    expect(a11y).toContain("15");
  });

  it("leaves axes whose findings all count untouched", () => {
    const lines = renderScoreCard(withUnscored, { ...opts });
    expect(lines.find((l) => l.includes("components"))).not.toMatch(/\+\d+/);
  });

  it("marks abstaining axes too — N/A plus hidden findings is the same lie", () => {
    const lines = renderScoreCard(withUnscored, { ...opts });
    expect(lines.find((l) => l.includes("ai-surface"))).toContain("2");
  });

  it("keeps the box square at the narrowest supported width", () => {
    const lines = renderScoreCard(withUnscored, { ...opts, width: 44 });
    const w = lines[0]!.length;
    for (const l of lines) expect(l.length).toBe(w);
    expect(lines.find((l) => l.includes("a11y"))).toContain("15");
  });
});

// On the polaris sub-path the golden harness audits, the components axis reads
// 92 on main and 16 on this branch — but the denominator went 1494 -> 134. The
// number did not drop; the measured surface did. A bare 16 where there used to
// be 92 misleads exactly as much as the vacuous 100 did, so how much was
// measured travels with the score.
describe("an axis score carries the size of what was measured", () => {
  const withCounts = {
    ...result,
    axes: [
      { axis: "tokens", score: "N/A", findings: 0, opportunities: 4, unscoredFindings: 0 },
      { axis: "a11y", score: 88, findings: 26, opportunities: 219, unscoredFindings: 0 },
      { axis: "components", score: 16, findings: 112, opportunities: 134, unscoredFindings: 0 },
      { axis: "stories", score: "N/A", findings: 0, opportunities: 0, unscoredFindings: 0 },
      { axis: "ai-surface", score: 85, findings: 6, opportunities: 39, unscoredFindings: 0 },
      { axis: "ai-governance", score: "N/A", findings: 0, opportunities: 11, unscoredFindings: 0 },
    ],
  } as unknown as AuditResult;

  it("shows the opportunity count next to a scored axis", () => {
    const lines = renderScoreCard(withCounts, { ...opts });
    expect(lines.find((l) => l.includes("components"))).toContain("134");
  });

  it("shows it for abstaining axes too — n=4 is why tokens is N/A", () => {
    const lines = renderScoreCard(withCounts, { ...opts });
    expect(lines.find((l) => l.includes("tokens"))).toContain("4");
  });

  it("keeps the box square", () => {
    const lines = renderScoreCard(withCounts, { ...opts });
    const w = lines[0]!.length;
    for (const l of lines) expect(l.length).toBe(w);
  });
});
