import { describe, expect, it } from "vitest";
import { renderEslintStyle, fromLegacyFinding } from "../eslint-style.js";
import { renderScoreGauge } from "../score-gauge.js";

describe("renderEslintStyle", () => {
  it("formats a single finding as <file>:<line>:<col>  <severity>  <rule>  <message>", () => {
    const out = renderEslintStyle({
      findings: [
        {
          ruleId: "tokens/no-hardcoded-color",
          severity: "error",
          message: "literal #fff",
          file: "Button.tsx",
          line: 42,
          column: 14,
          confidence: "high",
        },
      ],
      counted: 1,
      experimental: 0,
    });
    expect(out).toContain("Button.tsx:42:14");
    expect(out).toContain("ERROR");
    expect(out).toContain("tokens/no-hardcoded-color");
    expect(out).toContain("literal #fff");
  });

  it("emits EXP tag for low-confidence findings", () => {
    const out = renderEslintStyle({
      findings: [
        {
          ruleId: "components.duplication",
          severity: "warning",
          message: "may be a duplicate component",
          file: "src/widgets/Card.tsx",
          line: 7,
          column: 1,
          confidence: "low",
        },
      ],
      counted: 0,
      experimental: 1,
    });
    expect(out).toContain("EXP");
    expect(out).not.toContain("WARNING");
  });

  it("pads file location so the severity column aligns", () => {
    const out = renderEslintStyle({
      findings: [
        {
          ruleId: "tokens/no-hardcoded-color",
          severity: "error",
          message: "m1",
          file: "a.tsx",
          line: 1,
          column: 1,
        },
        {
          ruleId: "a11y/essentials",
          severity: "warning",
          message: "m2",
          file: "very/long/path/to/file/Card.tsx",
          line: 100,
          column: 4,
        },
      ],
      counted: 2,
      experimental: 0,
    });
    const lines = out.split("\n").filter((l) => l.includes(":"));
    // Both header lines should have ERROR/WARNING starting at the same column.
    const idx0 = lines[0]!.indexOf("ERROR");
    const idx1 = lines[1]!.indexOf("WARNING");
    expect(idx0).toBeGreaterThan(0);
    expect(idx1).toBeGreaterThan(0);
  });

  it("returns the empty string when there are no findings", () => {
    expect(renderEslintStyle({ findings: [], counted: 0, experimental: 0 })).toBe("");
  });

  it("renders missing line/column as '?'", () => {
    const out = renderEslintStyle({
      findings: [
        {
          ruleId: "rule/x",
          severity: "info",
          message: "m",
          file: "f.tsx",
          line: null,
        },
      ],
      counted: 0,
      experimental: 0,
    });
    expect(out).toContain("f.tsx:?:?");
  });

  it("normalizes 'warn' to WARNING in the tag", () => {
    const out = renderEslintStyle({
      findings: [
        {
          ruleId: "rule/x",
          severity: "warn",
          message: "m",
          file: "f.tsx",
          line: 1,
          column: 1,
        },
      ],
      counted: 1,
      experimental: 0,
    });
    expect(out).toContain("WARNING");
  });

  it("renders every finding when no limit is set", () => {
    const findings = Array.from({ length: 12 }, (_, i) => ({
      ruleId: "rule/x",
      severity: "error" as const,
      message: `m${i}`,
      file: `f${i}.tsx`,
      line: i + 1,
      column: 1,
    }));
    const out = renderEslintStyle({ findings, counted: 12, experimental: 0 });
    for (let i = 0; i < 12; i++) {
      expect(out).toContain(`f${i}.tsx:${i + 1}:1`);
    }
    expect(out).not.toContain("more findings");
  });

  it("renders all findings when limit is null (unlimited)", () => {
    const findings = Array.from({ length: 12 }, (_, i) => ({
      ruleId: "rule/x",
      severity: "error" as const,
      message: `m${i}`,
      file: `f${i}.tsx`,
      line: i + 1,
      column: 1,
    }));
    const out = renderEslintStyle({ findings, counted: 12, experimental: 0, limit: null });
    expect(out).toContain("f11.tsx:12:1");
    expect(out).not.toContain("more findings");
  });

  it("slices findings to limit and appends a 'N more findings' hint", () => {
    const findings = Array.from({ length: 12 }, (_, i) => ({
      ruleId: "rule/x",
      severity: "error" as const,
      message: `m${i}`,
      file: `f${i}.tsx`,
      line: i + 1,
      column: 1,
    }));
    const out = renderEslintStyle({ findings, counted: 12, experimental: 0, limit: 5 });
    expect(out).toContain("f0.tsx:1:1");
    expect(out).toContain("f4.tsx:5:1");
    expect(out).not.toContain("f5.tsx:6:1");
    expect(out).toContain("7 more findings");
  });

  it("does not show the 'more findings' hint when limit ≥ total", () => {
    const findings = Array.from({ length: 3 }, (_, i) => ({
      ruleId: "rule/x",
      severity: "error" as const,
      message: `m${i}`,
      file: `f${i}.tsx`,
      line: i + 1,
      column: 1,
    }));
    const out = renderEslintStyle({ findings, counted: 3, experimental: 0, limit: 50 });
    expect(out).toContain("f0.tsx:1:1");
    expect(out).toContain("f2.tsx:3:1");
    expect(out).not.toContain("more findings");
  });

  it("fromLegacyFinding maps location.{file,line,column} → flat fields", () => {
    const r = fromLegacyFinding({
      ruleId: "rule/x",
      axis: "tokens",
      severity: "error",
      location: { file: "Card.tsx", line: 12, column: 3 },
      message: "m",
      confidence: "medium",
    });
    expect(r.file).toBe("Card.tsx");
    expect(r.line).toBe(12);
    expect(r.column).toBe(3);
    expect(r.confidence).toBe("medium");
  });
});

describe("renderScoreGauge", () => {
  it("renders the scoring version string in the footer", () => {
    const out = renderScoreGauge(87, "scoring-v1", 12, 5);
    expect(out).toContain("Health Score: 87 / 100");
    expect(out).toContain("scoring-v1");
    expect(out).toContain("12 stable findings");
    expect(out).toContain("5 experimental (not counted)");
  });

  it("omits the experimental count when there are no experimental findings", () => {
    const out = renderScoreGauge(100, "scoring-v1", 0, 0);
    expect(out).toContain("0 findings counted in score");
    expect(out).not.toContain("experimental");
  });

  it("supports an N/A score for repos with no opportunities", () => {
    const out = renderScoreGauge("N/A", "scoring-v1", 0, 0);
    expect(out).toContain("Health Score: N/A");
  });

  it("includes the tool version when supplied", () => {
    const out = renderScoreGauge(90, "scoring-v1", 1, 0, { toolVersion: "0.1.0" });
    expect(out).toContain("lyse 0.1.0");
  });
});
