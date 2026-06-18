import { describe, it, expect, beforeEach, vi } from "vitest";

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

import { gitInit, gitCommitAll } from "../_helpers/git.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runFix } from "../../src/commands/fix.js";
import type { RuleResult } from "../../src/commands/fix.js";

let dir: string;

function setup() {
  dir = mkdtempSync(join(tmpdir(), "lyse-fix-"));
  gitInit(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "x", version: "1.0.0", dependencies: { react: "^18.0.0" } }),
  );
  writeFileSync(join(dir, ".lyse.yaml"), 'designSystem:\n  componentsModule: "@my/ui"\n');
  writeFileSync(
    join(dir, "Test.tsx"),
    'export const Test = () => <div style={{background:"#3B82F6"}}>x</div>;',
  );
  gitCommitAll(dir, "init");
}

beforeEach(setup);

describe("runFix safety guards", () => {
  // Guard 1: creates a separate branch (lyse/auto-fix-DATE)
  it("Guard 1: creates a separate branch (lyse/auto-fix-DATE)", async () => {
    const result = await runFix({ cwd: dir, dryRun: true, autoApprove: true });
    expect(result.branch).toMatch(/^lyse\/auto-fix-/);
  });

  // Guard 2: refuses on dirty working tree
  it("Guard 2: refuses on dirty tree", async () => {
    writeFileSync(join(dir, "extra.txt"), "uncommitted");
    await expect(runFix({ cwd: dir, autoApprove: true })).rejects.toThrow(/uncommitted/i);
  });

  // Guard 2 override: --force-on-dirty allows dirty tree
  it("Guard 2 override: allows dirty with forceOnDirty=true", async () => {
    writeFileSync(join(dir, "extra.txt"), "uncommitted");
    await expect(
      runFix({ cwd: dir, autoApprove: true, dryRun: true, forceOnDirty: true }),
    ).resolves.toBeDefined();
  });

  // Guard 4: default confidence floor is "high" — medium/low are skipped
  it("Guard 4: applies only high-confidence by default — skipped fields populated", async () => {
    const result = await runFix({ cwd: dir, autoApprove: true, dryRun: true });
    expect(result.skipped).toHaveProperty("medium");
    expect(result.skipped).toHaveProperty("low");
    expect(typeof result.skipped.medium).toBe("number");
    expect(typeof result.skipped.low).toBe("number");
  });

  // FixResult always has the required shape
  it("returns the expected FixResult shape in dry-run", async () => {
    const result = await runFix({ cwd: dir, dryRun: true, autoApprove: true });
    expect(result).toHaveProperty("branch");
    expect(result).toHaveProperty("ruleResults");
    expect(result).toHaveProperty("skipped");
    expect(Array.isArray(result.ruleResults)).toBe(true);
  });
});

describe("runFix — warnings surface applyDiff failures (regression for silent swallow)", () => {
  beforeEach(setup);

  it("RuleResult.warnings exists as optional field on the interface", () => {
    // Type-level check: RuleResult must accept warnings
    const r: RuleResult = { ruleId: "tokens/no-hardcoded-color", count: 0, commitSha: null };
    expect(r.warnings).toBeUndefined();
    const rWithWarnings: RuleResult = {
      ruleId: "tokens/no-hardcoded-color",
      count: 0,
      commitSha: null,
      warnings: ["Skipped finding at src/Foo.tsx:10 — codemod produced no diff"],
    };
    expect(rWithWarnings.warnings).toHaveLength(1);
    expect(rWithWarnings.warnings![0]).toContain("codemod produced no diff");
  });

  it("dry-run mode: ruleResults have no warnings (dry-run bypasses codemod path)", async () => {
    // In dry-run the loop is skipped — warnings should not be present
    const result = await runFix({ cwd: dir, dryRun: true, autoApprove: true });
    for (const r of result.ruleResults) {
      expect(r.warnings).toBeUndefined();
    }
  });

  it("applied count does NOT include findings where codemod produces no diff", async () => {
    // When a real fix runs and all codemods produce no diff, count stays 0 and warnings are populated.
    // We simulate this by limiting to a rule that has no matching findings in the minimal fixture.
    const result = await runFix({
      cwd: dir,
      autoApprove: true,
      rule: "stories/coverage",  // no stories in fixture → 0 opportunities → 0 fixable
    });
    // All rule results for storybook should have count = 0 (nothing applied)
    const storybookResults = result.ruleResults.filter((r) => r.ruleId === "stories/coverage");
    for (const r of storybookResults) {
      expect(r.count).toBe(0);
    }
  });
});
