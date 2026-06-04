import { describe, it, expect } from "vitest";
import { renderJson } from "../../src/reporters/json.js";
import type { AuditResult } from "../../src/types.js";

const sampleResult: AuditResult = {
  schemaVersion: 2, rulesVersion: "0.1.0", toolVersion: "0.0.1",
  scoringVersion: "scoring-v1",
  repoRoot: "/r", timestamp: "2026-06-10T10:00:00Z", stack: ["react"], finalScore: 50,
  axes: [
    { axis: "tokens", score: 50, findings: 1, opportunities: 2 },
    { axis: "a11y", score: 100, findings: 0, opportunities: 0 },
  ],
  findings: [
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "z.tsx", line: 1, column: 1 }, message: "z" },
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "a.tsx", line: 1, column: 1 }, message: "a" },
  ],
};

describe("renderJson", () => {
  it("produces valid JSON matching the schemaVersion contract", () => {
    const json = renderJson(sampleResult);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.finalScore).toBe(50);
  });

  it("is byte-identical across calls (determinism)", () => {
    expect(renderJson(sampleResult)).toBe(renderJson(sampleResult));
  });

  it("sorts object keys alphabetically at every depth", () => {
    const out = renderJson(sampleResult);
    // "axes" must appear before "findings" (alphabetical)
    expect(out.indexOf('"axes"')).toBeLessThan(out.indexOf('"findings"'));
    // "$schema" must appear FIRST (dollar sign < letters in ASCII)
    expect(out.indexOf('"$schema"')).toBeLessThan(out.indexOf('"axes"'));
  });

  it("sorts findings by (severity, file, line, column, ruleId)", () => {
    const out = renderJson(sampleResult);
    // a.tsx appears before z.tsx in the output (same severity, file ordering wins)
    expect(out.indexOf('"a.tsx"')).toBeLessThan(out.indexOf('"z.tsx"'));
  });

  it("omits timestamp by default (sets to empty string)", () => {
    const parsed = JSON.parse(renderJson(sampleResult));
    expect(parsed.timestamp).toBe("");
  });

  it("includes timestamp when requested", () => {
    const parsed = JSON.parse(renderJson(sampleResult, { includeTimestamp: true }));
    expect(parsed.timestamp).toBe("2026-06-10T10:00:00Z");
  });

  it("emits $schema URL pointing to schemas/v1/lyse-result.json", () => {
    const parsed = JSON.parse(renderJson(sampleResult));
    expect(parsed.$schema).toContain("schemas/v1/lyse-result.json");
  });

  it("does not mutate the input", () => {
    const before = JSON.stringify(sampleResult);
    renderJson(sampleResult);
    expect(JSON.stringify(sampleResult)).toBe(before);
  });

  it("preserves the deterministic subset of meta.coverage in default output", () => {
    const result: AuditResult = {
      ...sampleResult,
      meta: {
        coverage: { scannedFiles: 42, durationMs: 1234, configPath: null },
        layer4: { staticOnly: true },
      },
    };

    const out = JSON.parse(renderJson(result));
    expect(out.meta).toBeDefined();
    expect(out.meta.coverage.scannedFiles).toBe(42);
    expect(out.meta.coverage.configPath).toBeNull();
    expect(out.meta.coverage.durationMs).toBeUndefined();
    expect(out.meta.layer4).toBeUndefined();
  });

  it("emits the full meta (incl. durationMs + layer4) when includeTimestamp is true", () => {
    const result: AuditResult = {
      ...sampleResult,
      meta: {
        coverage: { scannedFiles: 42, durationMs: 1234, configPath: null },
        layer4: { staticOnly: true },
      },
    };

    const out = JSON.parse(renderJson(result, { includeTimestamp: true }));
    expect(out.meta.layer4).toBeDefined();
    expect(out.meta.coverage.durationMs).toBe(1234);
    expect(out.meta.coverage.scannedFiles).toBe(42);
  });

  it("default output is byte-identical across two runs with same input (determinism contract)", () => {
    const result: AuditResult = {
      ...sampleResult,
      meta: {
        coverage: { scannedFiles: 42, durationMs: 1234, configPath: null },
      },
    };
    const result2: AuditResult = {
      ...result,
      meta: { coverage: { ...result.meta!.coverage!, durationMs: 9999 } },
    };

    expect(renderJson(result)).toBe(renderJson(result2));
  });

  it("preserves meta.coverage.parseErrors as a deterministic subfield (#155)", () => {
    const withParseErrors: AuditResult = {
      ...sampleResult,
      meta: {
        coverage: {
          scannedFiles: 42,
          durationMs: 1234,
          configPath: null,
          parseErrors: [
            { file: "a.tsx", reason: "unexpected token" },
            { file: "z.tsx", reason: "unexpected token" },
          ],
        },
      },
    };
    const parsed = JSON.parse(renderJson(withParseErrors));
    expect(parsed.meta.coverage.parseErrors).toEqual([
      { file: "a.tsx", reason: "unexpected token" },
      { file: "z.tsx", reason: "unexpected token" },
    ]);
    expect(parsed.meta.coverage.durationMs).toBeUndefined();
  });
});
