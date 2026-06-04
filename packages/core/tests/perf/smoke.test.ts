/**
 * Perf smoke test — asserts that audit runs complete within budget.
 *
 * Budget: 5 000 ms for a full directory audit (spec § 5).
 * These tests run in CI on every PR touching packages/core/ via
 * .github/workflows/perf-smoke.yml.
 *
 * If a test starts failing: profile the audit pipeline before merging.
 * A 20%+ regression vs the last passing baseline warrants investigation.
 *
 * Layer 4 (LLM augmentation) is mocked out here to keep this a pure
 * static-analysis performance test — no network calls in CI.
 */

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

import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";

/** Absolute path to the full-ds fixture shipped with packages/core. */
const FULL_DS_FIXTURE = resolve(__dirname, "../../fixtures/full-ds");

describe("perf smoke", () => {
  it(
    "audits fixtures/full-ds in under 5 000ms",
    async () => {
      const start = performance.now();
      await auditDirectory(FULL_DS_FIXTURE);
      const duration = performance.now() - start;
      console.log(`[perf] full-ds audit: ${duration.toFixed(0)}ms`);
      expect(duration).toBeLessThan(5_000);
    },
    // Give vitest a generous wall-clock timeout — well above the 5s budget
    // so we measure the actual codemod time rather than a runner timeout.
    10_000,
  );

  it(
    "audits a single TSX file in under 250ms",
    async () => {
      // Point at a subdirectory with one file rather than trying to import
      // the MCP audit_file handler (which requires a live MCP server).
      // This exercises the same parse → rule → score pipeline, just on
      // a smaller input.
      const singleFilePath = resolve(__dirname, "../../fixtures/full-ds/src");
      const start = performance.now();
      await auditDirectory(singleFilePath);
      const duration = performance.now() - start;
      console.log(`[perf] single-dir audit (src/): ${duration.toFixed(0)}ms`);
      expect(duration).toBeLessThan(250);
    },
    5_000,
  );
});
