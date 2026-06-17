// Mock Layer 4 so this focuses on Svelte/Vue <style> ingestion only.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/llm/connectors/index.js", () => ({
  resolveConnector: vi.fn().mockResolvedValue({
    id: "direct-api-key", provider: "anthropic", model: "claude-sonnet-4-5", hasMarginalCost: true,
    augmentFindings: () => Promise.resolve({ findings: [], tokensConsumed: { input: 0, output: 0 }, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }),
    estimateCost: () => ({ usd: 0, tokensIn: 0, tokensOut: 0 }), ping: () => Promise.resolve({ ok: true }),
  }),
}));
vi.mock("../../src/llm/augmenter.js", () => ({
  Layer4Augmenter: vi.fn().mockImplementation(function () { return { run: vi.fn().mockResolvedValue({ findings: [], cacheHit: false, droppedHallucinations: 0, usdSpent: 0, modelUsed: "mock", llmQuality: "higher" }) }; }),
}));
vi.mock("../../src/llm/sampler.js", () => ({ sampleForAudit: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }) }));
vi.mock("../../src/util/git.js", () => ({ gitHeadSha: vi.fn().mockResolvedValue("no-git"), modifiedFilesWithHashes: vi.fn().mockResolvedValue([]) }));

import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("audit-pipeline: Svelte/Vue <style> ingestion (#102)", () => {
  it("flags a hardcoded color inside a Svelte component's <style> block", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-sfc-"));
    writeFileSync(join(dir, "package.json"), '{"name":"a","dependencies":{"svelte":"4"}}');
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "Button.svelte"),
      `<script>export let label;</script>\n<button>{label}</button>\n<style>button { color: #ff0000; }</style>`,
    );
    const result = await auditDirectory(dir);
    expect(result.result.findings.some((f) => f.ruleId === "tokens/no-hardcoded-color")).toBe(true);
  });

  it("flags a hardcoded color inside a Vue SFC <style> block", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-sfc-"));
    writeFileSync(join(dir, "package.json"), '{"name":"a","dependencies":{"vue":"3"}}');
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "Card.vue"),
      `<template><div class="card" /></template>\n<style scoped>.card { background: #00aa00; }</style>`,
    );
    const result = await auditDirectory(dir);
    expect(result.result.findings.some((f) => f.ruleId === "tokens/no-hardcoded-color")).toBe(true);
  });
});
