import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBaseline, serializeBaseline, readBaseline, writeBaseline, BaselineError } from "./baseline.js";
import type { AuditResult, Finding } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

function graph(): DesignSystemGraph {
  return { schemaVersion: 1, tokens: [], components: [], stories: [], usage: [],
    zones: { rules: [] } as unknown as DesignSystemGraph["zones"],
    extraction: {} as unknown as DesignSystemGraph["extraction"] };
}
function color(from: string, line: number): Finding {
  return { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file: "src/Button.tsx", line, column: 1 }, message: `x ${from}`,
    fixGroup: { key: `tokens/no-hardcoded-color::${from}`, from } };
}
function result(findings: Finding[]): AuditResult {
  return {
    schemaVersion: 3, rulesVersion: "t", toolVersion: "t", scoringVersion: "v3",
    repoRoot: ".", timestamp: "2026-07-22", stack: [], finalScore: 50, tier: "x",
    axes: [{ axis: "tokens", score: 62, findings: findings.length, opportunities: 100 },
           { axis: "a11y", score: "N/A", findings: 0, opportunities: 0 }],
    findings,
  } as AuditResult;
}

describe("buildBaseline", () => {
  it("counts findings by [file][rule][bucket] and stores numeric axis scores", () => {
    const b = buildBaseline(result([color("#3b82f6", 10), color("#3b82f6", 20), color("#fff", 30)]), graph());
    expect(b.findings["src/Button.tsx"]!["tokens/no-hardcoded-color"]).toEqual({ "#3b82f6": 2, "#fff": 1 });
    expect(b.scores).toEqual({ tokens: 62 }); // "N/A" axis omitted
    expect(b.schemaVersion).toBe(1);
    expect(b.graphHash).toMatch(/^sha256:/);
  });
});

describe("serializeBaseline", () => {
  it("is deterministic (byte-identical) and has no timestamp", () => {
    const b = buildBaseline(result([color("#fff", 1)]), graph());
    const s1 = serializeBaseline(b);
    const s2 = serializeBaseline(buildBaseline(result([color("#fff", 999)]), graph())); // line moved
    expect(s1).toBe(s2);
    expect(s1).not.toMatch(/timestamp|createdAt|\d{4}-\d{2}-\d{2}T/);
  });
});

describe("read/write round-trip", () => {
  it("writes then reads an equal baseline", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-bl-"));
    try {
      const p = join(dir, "baseline.json");
      const b = buildBaseline(result([color("#fff", 1)]), graph());
      writeBaseline(p, b);
      expect(readBaseline(p)).toEqual(b);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("throws BaselineError on a missing file", () => {
    expect(() => readBaseline(join(tmpdir(), "does-not-exist-xyz.json"))).toThrow(BaselineError);
  });
  it("throws BaselineError on malformed json", () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-bl-"));
    try {
      const p = join(dir, "baseline.json");
      writeFileSync(p, "{ not json");
      expect(() => readBaseline(p)).toThrow(BaselineError);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
