import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveConnector } from "../resolver.js";
import type { ResolveConnectorOptions } from "../resolver.js";
import type { LyseConfig } from "../../../types.js";

function mockFetch(text = "ok", model = "gpt-4o-mini") {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: text } }],
      model,
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    }),
  });
}

function tmpBudgetPath() {
  return join(mkdtempSync(join(tmpdir(), "lyse-resolver-")), "budget.json");
}

function tmpCacheDir() {
  return mkdtempSync(join(tmpdir(), "lyse-cache-"));
}

describe("resolveConnector", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns no-op when no llm config is set", async () => {
    const config: LyseConfig = {};
    const client = resolveConnector(config, undefined, {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
    });
    const result = await client.complete([{ role: "user", content: "x" }]);
    expect(result.text).toBe("");
    expect(result.usdSpent).toBe(0);
    expect(result.modelUsed).toBe("none");
  });

  it("returns no-op when staticOnly: true in flags", async () => {
    const config: LyseConfig = { llm: { provider: "openai", model: "gpt-4o" } };
    const client = resolveConnector(config, { staticOnly: true }, {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
    });
    const result = await client.complete([{ role: "user", content: "x" }]);
    expect(result.modelUsed).toBe("none");
  });

  it("returns no-op when config.llm.staticOnly is true", async () => {
    const config: LyseConfig = { llm: { staticOnly: true } };
    const client = resolveConnector(config, undefined, {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
    });
    const result = await client.complete([{ role: "user", content: "x" }]);
    expect(result.modelUsed).toBe("none");
  });

  it("refuses a call when the daily budget is exhausted", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetch = mockFetch();
    const budgetPath = tmpBudgetPath();
    const opts: ResolveConnectorOptions = {
      budgetStatePath: budgetPath,
      cacheDir: tmpCacheDir(),
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    };
    const config: LyseConfig = { llm: { provider: "openai", model: "gpt-4o-mini", costCapUsd: 1.0 } };

    const client1 = resolveConnector(config, undefined, opts);
    const r1 = await client1.complete([{ role: "user", content: "x" }]);
    expect(r1.text).toBe("ok");

    const { LLMBudget } = await import("../../../reliability/llm-eval/budget.js");
    const b = new LLMBudget({ dailyUsd: 1.0, statePath: budgetPath });
    b.record(2.0);

    const client2 = resolveConnector(config, undefined, opts);
    const r2 = await client2.complete([{ role: "user", content: "y" }]);
    expect(r2.modelUsed).toBe("none");
    expect(r2.usdSpent).toBe(0);
  });

  it("returns a cache hit on second call with same messages", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetch = mockFetch("cached-text");
    const cacheDir = tmpCacheDir();
    const opts: ResolveConnectorOptions = {
      budgetStatePath: tmpBudgetPath(),
      cacheDir,
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    };
    const config: LyseConfig = {
      llm: { provider: "openai", model: "gpt-4o-mini", cacheMaxAgeDays: 7 },
    };

    const client = resolveConnector(config, undefined, opts);
    const msgs = [{ role: "user" as const, content: "hello" }];

    const r1 = await client.complete(msgs);
    expect(r1.cacheHit).toBe(false);
    expect(r1.text).toBe("cached-text");

    const r2 = await client.complete(msgs);
    expect(r2.cacheHit).toBe(true);
    expect(r2.usdSpent).toBe(0);
    expect(r2.text).toBe("cached-text");

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("mcp-host connector throws ConnectorNotImplementedError", async () => {
    const config: LyseConfig = { llm: { provider: "openai", connector: "mcp-host" } };
    const client = resolveConnector(config, undefined, {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
    });
    await expect(
      client.complete([{ role: "user", content: "x" }]),
    ).rejects.toThrow("mcp-host");
  });

  it("noCache: true — second identical call bypasses cache and calls transport again", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const fetch = mockFetch("fresh-text");
    const opts: ResolveConnectorOptions = {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    };
    const config: LyseConfig = {
      llm: { provider: "openai", model: "gpt-4o-mini", cacheMaxAgeDays: 7 },
    };

    const msgs = [{ role: "user" as const, content: "hello" }];

    const client1 = resolveConnector(config, { noCache: true }, opts);
    const r1 = await client1.complete(msgs);
    expect(r1.cacheHit).toBe(false);

    const client2 = resolveConnector(config, { noCache: true }, opts);
    const r2 = await client2.complete(msgs);
    expect(r2.cacheHit).toBe(false);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("provider mcp throws ConnectorNotImplementedError", async () => {
    const config: LyseConfig = { llm: { provider: "mcp" } };
    const client = resolveConnector(config, undefined, {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
    });
    await expect(
      client.complete([{ role: "user", content: "x" }]),
    ).rejects.toThrow("mcp");
  });
});
