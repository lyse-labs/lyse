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
