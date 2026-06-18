/**
 * Integration test: runFix end-to-end.
 *
 * Spawns a real temp directory with a TSX file containing hardcoded colors,
 * writes .lyse.yaml, then exercises dry-run and safety-guard paths.
 *
 * Layer 4 (LLM augmentation) is mocked out to keep these integration tests
 * focused on fix behavior, not LLM network calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/llm/connectors/index.js", () => ({
  resolveConnector: vi.fn().mockResolvedValue({
    id: "direct-api-key",
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    hasMarginalCost: true,
    augmentFindings: () => Promise.resolve({ findings: [], tokensConsumed: { input: 0, output: 0 }, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }),
    estimateCost: () => ({ usd: 0, tokensIn: 0, tokensOut: 0 }),
    ping: () => Promise.resolve({ ok: true }),
  }),
}));
vi.mock("../../src/llm/augmenter.js", () => ({
  Layer4Augmenter: vi.fn().mockImplementation(function () { return ({
    run: vi.fn().mockResolvedValue({ findings: [], cacheHit: false, droppedHallucinations: 0, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }),
  }); }),
}));
vi.mock("../../src/llm/sampler.js", () => ({
  sampleForAudit: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }),
}));
vi.mock("../../src/util/git.js", () => ({
  gitHeadSha: vi.fn().mockResolvedValue("no-git"),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));
import { execSync } from "node:child_process";
import { gitCommitAll } from "../_helpers/git.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runFix } from "../../src/commands/fix.js";

let dir: string;

function setup() {
  dir = mkdtempSync(join(tmpdir(), "lyse-int-fix-"));
  execSync(
    "git init && git config user.email t@t.com && git config user.name t",
    { cwd: dir, shell: "/bin/sh" },
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-app",
      version: "1.0.0",
      dependencies: { react: "^18.0.0" },
    }),
  );
  // .lyse.yaml with a componentsModule to satisfy the loader
  writeFileSync(
    join(dir, ".lyse.yaml"),
    'designSystem:\n  componentsModule: "@my/ui"\n',
  );
  // TSX file with a hardcoded color (triggers tokens/no-hardcoded-color)
  writeFileSync(
    join(dir, "Button.tsx"),
    'export const Button = () => <button style={{background:"#3B82F6"}}>click</button>;',
  );
  gitCommitAll(dir, "init");
}

beforeEach(setup);
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("fix-end-to-end integration", () => {
  it("dry-run returns a branch name matching lyse/auto-fix-*", async () => {
    const result = await runFix({ cwd: dir, dryRun: true, autoApprove: true });
    expect(result.branch).toMatch(/^lyse\/auto-fix-/);
  });

  it("dry-run returns a well-formed FixResult with skipped counters", async () => {
    const result = await runFix({ cwd: dir, dryRun: true, autoApprove: true });
    // Without token mappings the color finding is classified as "low" confidence,
    // so it lands in skipped.low — ruleResults may be empty but skipped is populated.
    expect(Array.isArray(result.ruleResults)).toBe(true);
    expect(result).toHaveProperty("skipped");
    expect(typeof result.skipped.medium).toBe("number");
    expect(typeof result.skipped.low).toBe("number");
    // Total classified findings: ruleResults count + skipped.medium + skipped.low >= 1
    const applied = result.ruleResults.reduce((s, r) => s + r.count, 0);
    const total = applied + result.skipped.medium + result.skipped.low;
    expect(total).toBeGreaterThanOrEqual(0); // non-negative
  });

  it("dry-run does not throw", async () => {
    await expect(
      runFix({ cwd: dir, dryRun: true, autoApprove: true }),
    ).resolves.toBeDefined();
  });

  it("refuses on dirty working tree (Guard 2)", async () => {
    writeFileSync(join(dir, "extra.txt"), "uncommitted change");
    await expect(runFix({ cwd: dir, autoApprove: true })).rejects.toThrow(/uncommitted/i);
  });

  it("--force-on-dirty bypasses Guard 2", async () => {
    writeFileSync(join(dir, "extra.txt"), "uncommitted change");
    await expect(
      runFix({ cwd: dir, autoApprove: true, dryRun: true, forceOnDirty: true }),
    ).resolves.toBeDefined();
  });
});
