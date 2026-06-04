// Integration test for issue #97 — verifies that the audit pipeline calls
// the spinner's `update()` at each phase boundary. We don't drive the CLI
// here (the CLI wiring is exercised by the manual smoke + the spinner unit
// tests); instead we pass a stub spinner directly to `auditDirectory` and
// assert the expected sequence of phase labels.

import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Layer 4 mocks (mirroring audit-pipeline-generated-rules.test.ts).
vi.mock("../../src/llm/connectors/index.js", () => ({
  resolveConnector: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../src/llm/augmenter.js", () => ({
  Layer4Augmenter: vi.fn().mockImplementation(function () {
    return {
      run: vi.fn().mockResolvedValue({
        findings: [],
        cacheHit: false,
        droppedHallucinations: 0,
        usdSpent: 0,
        modelUsed: "mock",
        llmQuality: "higher",
      }),
    };
  }),
}));
vi.mock("../../src/llm/sampler.js", () => ({
  sampleForAudit: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
}));
vi.mock("../../src/util/git.js", () => ({
  gitHeadSha: vi.fn().mockResolvedValue("no-git"),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));

import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import type { Spinner } from "../../src/util/spinner.js";

function makeStubSpinner(): { spy: Spinner; calls: { update: string[]; succeed: string[]; fail: string[] } } {
  const calls = { update: [] as string[], succeed: [] as string[], fail: [] as string[] };
  const spy: Spinner = {
    start: (_label: string) => {},
    update: (label: string) => {
      calls.update.push(label);
    },
    succeed: (label: string) => {
      calls.succeed.push(label);
    },
    fail: (label: string) => {
      calls.fail.push(label);
    },
    stop: () => {},
  };
  return { spy, calls };
}

describe("audit-pipeline: spinner phase labels (issue #97)", () => {
  it("calls progress.update() at each phase boundary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-spinner-"));
    writeFileSync(join(dir, "package.json"), '{"name":"x","dependencies":{"react":"18"}}');
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "A.tsx"), 'const x = <div style={{ color: "#fff" }} />;');

    const { spy, calls } = makeStubSpinner();
    await auditDirectory(dir, { staticOnly: true, progress: spy });

    // Five phase labels in order: discovering → parsing → loading → rules → scoring.
    expect(calls.update[0]).toMatch(/^Discovering files/);
    expect(calls.update[1]).toMatch(/^Parsing source \(\d+ files\)/);
    expect(calls.update[2]).toMatch(/^Loading tokens \+ components \+ stories/);
    expect(calls.update[3]).toMatch(/^Running \d+ rules/);
    expect(calls.update[4]).toMatch(/^Scoring/);
    // Pipeline never owns the final state — succeed/fail is the CLI's job.
    expect(calls.succeed).toHaveLength(0);
    expect(calls.fail).toHaveLength(0);
  });

  it("is silent when no progress reporter is provided (back-compat for fix.ts)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-spinner-noop-"));
    writeFileSync(join(dir, "package.json"), '{"name":"x","dependencies":{"react":"18"}}');
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "A.tsx"), "export const X = 1;");
    // No progress field — must not throw.
    await expect(auditDirectory(dir, { staticOnly: true })).resolves.toBeDefined();
  });
});
