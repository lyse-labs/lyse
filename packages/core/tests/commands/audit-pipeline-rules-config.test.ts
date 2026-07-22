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
  // `:root` establishes a real color token matching the literal below (never
  // flagged itself — isCssCustomPropertyDeclaration guard) so the four-class
  // resolver classifies `#ff0000` `exact` (severity "warning"), not `novel`
  // (severity "info") — needed for the severity-override test below, which
  // asserts the pre-override severity is "warning".
  writeFileSync(join(dir, "src", "a.css"), ":root { --brand: #ff0000; } .x { color: #ff0000; padding: 13px; }");
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

  it("applies a severity override to displayed findings WITHOUT changing the score", async () => {
    const dir = scaffold();
    const ruleId = "tokens/no-hardcoded-color";
    const before = await auditDirectory(dir);
    const beforeF = before.result.findings.find((f) => f.ruleId === ruleId);
    expect(beforeF?.severity).toBe("warning");

    writeFileSync(join(dir, ".lyse.yaml"), `rules:\n  ${ruleId}:\n    severity: error\n`);
    const after = await auditDirectory(dir);
    const afterF = after.result.findings.find((f) => f.ruleId === ruleId);
    // display severity flips...
    expect(afterF?.severity).toBe("error");
    // ...but the Health Score is unchanged (determinism contract).
    expect(after.result.finalScore).toBe(before.result.finalScore);
    // and findings on other rules keep their severity
    const other = after.result.findings.find((f) => f.ruleId !== ruleId);
    const otherBefore = before.result.findings.find((f) => f.ruleId === other?.ruleId);
    expect(other?.severity).toBe(otherBefore?.severity);
  });

  it("@lyse-overrides frontmatter `off` suppresses a finding in that file", async () => {
    const dir = scaffold();
    const tsx = join(dir, "src", "Page.tsx");
    const ruleId = "tokens/no-hardcoded-color";
    writeFileSync(tsx, 'export default () => <div style={{ background: "#2563eb" }}>x</div>;');
    const before = await auditDirectory(dir);
    expect(before.result.findings.some((f) => f.ruleId === ruleId && f.location.file.endsWith("Page.tsx"))).toBe(true);

    writeFileSync(
      tsx,
      `/**\n * @lyse-overrides\n *   ${ruleId}: off\n */\nexport default () => <div style={{ background: "#2563eb" }}>x</div>;`,
    );
    const after = await auditDirectory(dir);
    expect(after.result.findings.some((f) => f.ruleId === ruleId && f.location.file.endsWith("Page.tsx"))).toBe(false);
    expect(after.result.suppressedFindings?.some((f) => f.ruleId === ruleId)).toBe(true);
  });

  it("@lyse-overrides frontmatter severity flips display without changing the score", async () => {
    const dir = scaffold();
    const tsx = join(dir, "src", "Page.tsx");
    const ruleId = "tokens/no-hardcoded-color";
    writeFileSync(tsx, 'export default () => <div style={{ background: "#2563eb" }}>x</div>;');
    const before = await auditDirectory(dir);

    writeFileSync(
      tsx,
      `/**\n * @lyse-overrides\n *   ${ruleId}: error\n */\nexport default () => <div style={{ background: "#2563eb" }}>x</div>;`,
    );
    const after = await auditDirectory(dir);
    const f = after.result.findings.find((x) => x.ruleId === ruleId && x.location.file.endsWith("Page.tsx"));
    expect(f?.severity).toBe("error");
    expect(after.result.finalScore).toBe(before.result.finalScore);
  });

  it("throws on an unknown rule id in the rules: block", async () => {
    const dir = scaffold();
    writeFileSync(join(dir, ".lyse.yaml"), `rules:\n  tokens/typoooo: off\n`);
    await expect(auditDirectory(dir)).rejects.toThrow(/tokens\/typoooo/);
  });
});
