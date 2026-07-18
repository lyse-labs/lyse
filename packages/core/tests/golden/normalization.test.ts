import { describe, expect, it } from "vitest";
import type { AuditResult } from "../../src/types.js";
import { normalizeGolden } from "./normalization.js";

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
    findings: [],
    meta: { coverage: { scannedFiles: 3, durationMs: 999, configPath: `${repoRoot}/.lyse.yaml` } },
  }) as unknown as AuditResult;

describe("normalizeGolden", () => {
  it("is path-independent (clone dir does not leak into the snapshot)", () => {
    const a = normalizeGolden(base("/tmp/lyse-golden-corpus/carbon-abc"), "/tmp/lyse-golden-corpus/carbon-abc");
    const b = normalizeGolden(base("/home/runner/work/x/carbon-abc"), "/home/runner/work/x/carbon-abc");
    expect(a).toBe(b);
    expect(a).not.toContain("/tmp/");
    expect(a).toContain("<REPO>");
  });

  it("strips wallclock duration and timestamp", () => {
    const out = normalizeGolden(base("/x"), "/x");
    expect(out).not.toContain("999");
    expect(out).not.toContain("2026-01-01T00:00:00Z");
  });
});
