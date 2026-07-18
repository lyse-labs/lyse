import { describe, expect, it } from "vitest";
import type { AuditResult } from "../../src/types.js";
import { compactGolden } from "./normalization.js";

const base = (repoRoot: string): AuditResult =>
  ({
    schemaVersion: 2,
    rulesVersion: "x",
    toolVersion: "x",
    scoringVersion: "scoring-v1",
    repoRoot,
    timestamp: "2026-01-01T00:00:00Z",
    stack: ["react"],
    finalScore: 42,
    tier: "Defined",
    axes: [],
    findings: [
      { ruleId: "test-rule", severity: "warning", location: { file: `${repoRoot}/src/a.ts`, line: 1, column: 1 } },
    ],
    meta: { coverage: { scannedFiles: 3, durationMs: 999, configPath: `${repoRoot}/.lyse.yaml` } },
  }) as unknown as AuditResult;

describe("compactGolden", () => {
  it("is path-independent (clone dir does not leak into the snapshot)", () => {
    const a = compactGolden(base("/tmp/lyse-golden-corpus/carbon-abc"), "/tmp/lyse-golden-corpus/carbon-abc");
    const b = compactGolden(base("/home/runner/work/x/carbon-abc"), "/home/runner/work/x/carbon-abc");
    expect(a).toBe(b);
    expect(a).not.toContain("/tmp/");
    expect(a).toContain("<REPO>");
  });

  it("collapses findings to a count + digest, with no findings array", () => {
    const parsed = JSON.parse(compactGolden(base("/x"), "/x")) as Record<string, unknown>;
    expect(parsed.findings).toBeUndefined();
    expect(typeof parsed.findingsCount).toBe("number");
    expect(parsed.findingsCount).toBe(1);
    expect(typeof parsed.findingsDigest).toBe("string");
    expect(parsed.findingsDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("strips wallclock duration and timestamp", () => {
    const out = compactGolden(base("/x"), "/x");
    expect(out).not.toContain("999");
    expect(out).not.toContain("2026-01-01T00:00:00Z");
  });
});
