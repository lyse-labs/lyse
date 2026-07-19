import { describe, it, expect } from "vitest";
import { scoreV3, MIN_SAMPLE_SIZE } from "../src/scorer-v3.js";
import type { Finding, PerRuleOpportunity } from "../src/types.js";

const F = (ruleId: string, axis: Finding["axis"]): Finding =>
  ({ ruleId, axis, severity: "error", message: "x", location: { file: "a", line: 1, column: 1 } } as Finding);
const O = (ruleId: string, axis: PerRuleOpportunity["axis"], opportunities: number): PerRuleOpportunity =>
  ({ ruleId, axis, opportunities });

describe("scoreV3 — adoption ratios", () => {
  it("axis score = opportunity-weighted adoption over its rules", () => {
    // tokens: rule A 90 clean of 100; rule B 30 clean of 50 → (90+30)/150 = 0.8
    const opps = [O("A", "tokens", 100), O("B", "tokens", 50)];
    const finds = [...Array(10).fill(0).map(() => F("A", "tokens")), ...Array(20).fill(0).map(() => F("B", "tokens"))];
    const r = scoreV3(finds, opps);
    expect(r.axes.find((a) => a.axis === "tokens")!.score).toBe(80);
  });

  it("no cliff: any positive adoption keeps the axis > 0", () => {
    // 149 findings against 150 opps across two rules, 1 clean → > 0, never 0
    const opps = [O("A", "tokens", 100), O("B", "tokens", 50)];
    const finds = [...Array(99).fill(0).map(() => F("A", "tokens")), ...Array(50).fill(0).map(() => F("B", "tokens"))];
    const r = scoreV3(finds, opps);
    expect(r.axes.find((a) => a.axis === "tokens")!.score).toBeGreaterThan(0);
  });

  it("per-rule clamp: a miscounted rule (findings > opp) contributes 0, never negative", () => {
    // llms-txt-style: rule B opp 1, 4 findings → clean 0; rule A 35 clean of 40 → 35/41
    const opps = [O("A", "ai-surface", 40), O("B", "ai-surface", 1)];
    const finds = [...Array(5).fill(0).map(() => F("A", "ai-surface")), ...Array(4).fill(0).map(() => F("B", "ai-surface"))];
    const r = scoreV3(finds, opps);
    const s = r.axes.find((a) => a.axis === "ai-surface")!.score;
    expect(s).toBe(Math.round((100 * 35) / 41)); // 85, not negative
  });

  it("min-N: axis with total opportunities < MIN_SAMPLE_SIZE is N/A and excluded from the mean", () => {
    const opps = [O("A", "tokens", 100), O("B", "ai-surface", 13)];
    const finds = [F("B", "ai-surface")];
    const r = scoreV3(finds, opps);
    expect(r.axes.find((a) => a.axis === "ai-surface")!.score).toBe("N/A");
    expect(r.axes.find((a) => a.axis === "ai-surface")!.opportunities).toBe(13); // reporter derives "insufficient sample (n=13)"
    expect(r.finalScore).toBe(100); // tokens only
  });

  it("opportunities == 0 → axis N/A", () => {
    const r = scoreV3([], [O("A", "tokens", 100)]);
    expect(r.axes.find((a) => a.axis === "a11y")!.score).toBe("N/A");
  });

  it("all axes below N → finalScore N/A", () => {
    const r = scoreV3([], [O("A", "tokens", 10)]);
    expect(r.finalScore).toBe("N/A");
    expect(r.tier).toBe("N/A");
  });

  it("MIN_SAMPLE_SIZE is 30 and overridable", () => {
    expect(MIN_SAMPLE_SIZE).toBe(30);
    const r = scoreV3([], [O("A", "tokens", 20)], { minSampleSize: 10 });
    expect(r.axes.find((a) => a.axis === "tokens")!.score).toBe(100);
  });
});
