// Mock Layer 4 so this test focuses on the rules: config wiring only.
import { describe, it, expect, vi } from "vitest";

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
  Layer4Augmenter: vi.fn().mockImplementation(function () {
    return { run: vi.fn().mockResolvedValue({ findings: [], cacheHit: false, droppedHallucinations: 0, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }) };
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
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function scaffold(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-rules-config-"));
  writeFileSync(join(dir, "package.json"), '{"name":"a","dependencies":{"react":"18"}}');
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.css"), ".x { color: #ff0000; padding: 13px; }");
  return dir;
}

describe("audit-pipeline: rules: config block", () => {
  it("disables a rule via `rules: { <id>: off }` so it contributes no findings", async () => {
    const dir = scaffold();
    const before = await auditDirectory(dir);
    const ruleId = "tokens/no-hardcoded-color";
    expect(before.result.findings.some((f) => f.ruleId === ruleId)).toBe(true);

    writeFileSync(join(dir, ".lyse.yaml"), `rules:\n  ${ruleId}: off\n`);
    const after = await auditDirectory(dir);
    expect(after.result.findings.some((f) => f.ruleId === ruleId)).toBe(false);
    // other rules still run
    expect(after.result.findings.length).toBeLessThan(before.result.findings.length);
  });

  it("throws on an unknown rule id in the rules: block", async () => {
    const dir = scaffold();
    writeFileSync(join(dir, ".lyse.yaml"), `rules:\n  tokens/typoooo: off\n`);
    await expect(auditDirectory(dir)).rejects.toThrow(/tokens\/typoooo/);
  });
});
