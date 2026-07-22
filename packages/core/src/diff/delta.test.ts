import { describe, it, expect } from "vitest";
import { selectNew } from "./delta.js";
import { buildBaseline } from "./baseline.js";
import type { AuditResult, Finding } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

function graph(): DesignSystemGraph {
  return { schemaVersion: 1, tokens: [], components: [], stories: [], usage: [],
    zones: { rules: [] } as unknown as DesignSystemGraph["zones"],
    extraction: {} as unknown as DesignSystemGraph["extraction"] };
}
function color(from: string, line: number): Finding {
  return { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file: "a.tsx", line, column: 1 }, message: `x ${from}`,
    fixGroup: { key: `tokens/no-hardcoded-color::${from}`, from } };
}
function shadow(line: number): Finding {
  return { ruleId: "components/no-native-shadows", axis: "components", severity: "warning",
    location: { file: "a.tsx", line, column: 1 }, message: "shadow" };
}
function res(findings: Finding[]): AuditResult {
  return { schemaVersion: 3, rulesVersion: "t", toolVersion: "t", scoringVersion: "v3",
    repoRoot: ".", timestamp: "2026-07-22", stack: [], finalScore: 50, tier: "x",
    axes: [{ axis: "tokens", score: 60, findings: findings.length, opportunities: 100 }],
    findings } as AuditResult;
}

describe("selectNew", () => {
  it("reformat-only (same content, lines moved) → 0 new findings [HEADLINE ACCEPTANCE]", () => {
    const base = buildBaseline(res([color("#fff", 10), color("#000", 20)]), graph());
    const after = [color("#fff", 13), color("#000", 27)]; // reindented
    expect(selectNew(after, base, graph()).newFindings).toEqual([]);
  });

  it("content bucket: +1 identical literal in a file with N → exactly 1 new", () => {
    const base = buildBaseline(res([color("#fff", 10), color("#fff", 20), color("#fff", 30)]), graph());
    const after = [color("#fff", 10), color("#fff", 20), color("#fff", 30), color("#fff", 40)];
    const out = selectNew(after, base, graph()).newFindings;
    expect(out.length).toBe(1);
  });

  it("content bucket: a brand-new distinct literal → 1 new", () => {
    const base = buildBaseline(res([color("#fff", 10)]), graph());
    const after = [color("#fff", 10), color("#123456", 20)];
    const out = selectNew(after, base, graph()).newFindings;
    expect(out.map((f) => f.fixGroup?.from)).toEqual(["#123456"]);
  });

  it("occurrence bucket: count increase → reports ALL findings of that (file,rule)", () => {
    const base = buildBaseline(res([shadow(10), shadow(20)]), graph());
    const after = [shadow(10), shadow(20), shadow(30)];
    expect(selectNew(after, base, graph()).newFindings.length).toBe(3);
  });

  it("removed finding (count drops) → nothing reported", () => {
    const base = buildBaseline(res([color("#fff", 10), color("#fff", 20)]), graph());
    expect(selectNew([color("#fff", 10)], base, graph()).newFindings).toEqual([]);
  });

  it("flags staleGraph when the graph hash differs", () => {
    const base = buildBaseline(res([color("#fff", 10)]), graph());
    const g2 = { ...graph(), tokens: [{ id: "c", axis: "color", rawValue: "#fff" } as unknown as DesignSystemGraph["tokens"][number]] };
    expect(selectNew([color("#fff", 10)], base, g2).staleGraph).toBe(true);
    expect(selectNew([color("#fff", 10)], base, graph()).staleGraph).toBe(false);
  });
});
