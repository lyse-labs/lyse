import { describe, it, expect } from "vitest";
import { aiSurfaceVersioningAdapters } from "../../validation/ai-surface-versioning-adapters.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";

describe("aiSurfaceVersioningAdapters — sampled e2e oracle check", () => {
  it("agentsMdQualityAdapter: fn===0 and fp===0", async () => {
    const adapter = aiSurfaceVersioningAdapters.find((a) => a.ruleId === "ai-surface/agents-md-quality");
    if (!adapter) throw new Error("adapter not found");
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("semverVersioningAdapter: fn===0 and fp===0", async () => {
    const adapter = aiSurfaceVersioningAdapters.find((a) => a.ruleId === "versioning/semver-versioning");
    if (!adapter) throw new Error("adapter not found");
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);

  it("mcpConfigPresentAdapter: fn===0 and fp===0", async () => {
    const adapter = aiSurfaceVersioningAdapters.find((a) => a.ruleId === "ai-surface/mcp-config-present");
    if (!adapter) throw new Error("adapter not found");
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
  }, 60_000);
});
