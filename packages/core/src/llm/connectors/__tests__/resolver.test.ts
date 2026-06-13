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

// Suppress agent-cli auto-default in tests that target the Noop path: most
// dev machines have `claude` on PATH, which would flip these expectations.
const noAgentCli: Pick<ResolveConnectorOptions, "agentCliAvailable"> = {
  agentCliAvailable: () => false,
};

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
      ...noAgentCli,
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
      ...noAgentCli,
    });
    const result = await client.complete([{ role: "user", content: "x" }]);
    expect(result.modelUsed).toBe("none");
  });

  it("returns no-op when config.llm.staticOnly is true", async () => {
    const config: LyseConfig = { llm: { staticOnly: true } };
    const client = resolveConnector(config, undefined, {
      budgetStatePath: tmpBudgetPath(),
      cacheDir: tmpCacheDir(),
      ...noAgentCli,
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
      ...noAgentCli,
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
      ...noAgentCli,
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
      ...noAgentCli,
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
      ...noAgentCli,
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
      ...noAgentCli,
    });
    await expect(
      client.complete([{ role: "user", content: "x" }]),
    ).rejects.toThrow("mcp");
  });

  // agent-cli connector tests
  describe("agent-cli connector", () => {
    it("provider:agent-cli resolves to the adapter and returns its result", async () => {
      const { AgentCliAdapter } = await import("../agent-cli-adapter.js");
      vi.spyOn(AgentCliAdapter.prototype, "complete").mockImplementation(async () => ({
        text: "agent ok",
        usdSpent: 0.0005,
        modelUsed: "claude-sonnet-4-6",
        llmQuality: "higher" as const,
        cacheHit: false,
      }));

      const config: LyseConfig = { llm: { provider: "agent-cli", model: "claude-sonnet-4-6" } };
      const client = resolveConnector(config, undefined, {
        budgetStatePath: tmpBudgetPath(),
        cacheDir: tmpCacheDir(),
        ...noAgentCli,
      });
      const result = await client.complete([{ role: "user", content: "audit" }]);
      expect(result.text).toBe("agent ok");
      expect(result.llmQuality).toBe("higher");
      vi.restoreAllMocks();
    });

    it("connector:agent-cli resolves to the adapter", async () => {
      const { AgentCliAdapter } = await import("../agent-cli-adapter.js");
      vi.spyOn(AgentCliAdapter.prototype, "complete").mockImplementation(async () => ({
        text: "connector ok",
        usdSpent: 0,
        modelUsed: "claude-sonnet-4-6",
        llmQuality: "higher" as const,
        cacheHit: false,
      }));

      const config: LyseConfig = { llm: { connector: "agent-cli", model: "claude-sonnet-4-6" } };
      const client = resolveConnector(config, undefined, {
        budgetStatePath: tmpBudgetPath(),
        cacheDir: tmpCacheDir(),
        ...noAgentCli,
      });
      const result = await client.complete([{ role: "user", content: "x" }]);
      expect(result.text).toBe("connector ok");
      vi.restoreAllMocks();
    });

    it("no provider + agentCliAvailable=true → auto-selects agent-cli", async () => {
      // Temporarily remove the LYSE_DISABLE_AGENT_AUTODETECT guard (set by global
      // vitest setup) so this test can exercise the actual auto-detect path.
      const prev = process.env["LYSE_DISABLE_AGENT_AUTODETECT"];
      try {
        delete process.env["LYSE_DISABLE_AGENT_AUTODETECT"];

        const { AgentCliAdapter } = await import("../agent-cli-adapter.js");
        vi.spyOn(AgentCliAdapter.prototype, "complete").mockImplementation(async () => ({
          text: "auto-agent",
          usdSpent: 0,
          modelUsed: "claude-sonnet-4-6",
          llmQuality: "higher" as const,
          cacheHit: false,
        }));

        const config: LyseConfig = {};
        const client = resolveConnector(config, undefined, {
          budgetStatePath: tmpBudgetPath(),
          cacheDir: tmpCacheDir(),
          agentCliAvailable: () => true,
        });
        const result = await client.complete([{ role: "user", content: "x" }]);
        expect(result.text).toBe("auto-agent");
        expect(result.llmQuality).toBe("higher");
        vi.restoreAllMocks();
      } finally {
        if (prev !== undefined) {
          process.env["LYSE_DISABLE_AGENT_AUTODETECT"] = prev;
        } else {
          process.env["LYSE_DISABLE_AGENT_AUTODETECT"] = "1";
        }
      }
    });

    it("no provider + agentCliAvailable=false → Noop", async () => {
      const config: LyseConfig = {};
      const client = resolveConnector(config, undefined, {
        budgetStatePath: tmpBudgetPath(),
        cacheDir: tmpCacheDir(),
        agentCliAvailable: () => false,
      });
      const result = await client.complete([{ role: "user", content: "x" }]);
      expect(result.modelUsed).toBe("none");
      expect(result.text).toBe("");
    });

    it("--static-only → Noop even when agentCliAvailable=true", async () => {
      const config: LyseConfig = {};
      const client = resolveConnector(config, { staticOnly: true }, {
        budgetStatePath: tmpBudgetPath(),
        cacheDir: tmpCacheDir(),
        agentCliAvailable: () => true,
      });
      const result = await client.complete([{ role: "user", content: "x" }]);
      expect(result.modelUsed).toBe("none");
    });

    it("provider:none → Noop even when agentCliAvailable=true", async () => {
      const config: LyseConfig = { llm: { provider: "none" } };
      const client = resolveConnector(config, undefined, {
        budgetStatePath: tmpBudgetPath(),
        cacheDir: tmpCacheDir(),
        agentCliAvailable: () => true,
      });
      const result = await client.complete([{ role: "user", content: "x" }]);
      expect(result.modelUsed).toBe("none");
    });

    describe("LYSE_DISABLE_AGENT_AUTODETECT env guard", () => {
      it("returns NoopAdapter when LYSE_DISABLE_AGENT_AUTODETECT=1, even if agentCliAvailable=true", () => {
        // The global setup file already sets this to "1", so we just verify it works
        // with the env var explicitly set here too.
        vi.stubEnv("LYSE_DISABLE_AGENT_AUTODETECT", "1");

        const config: LyseConfig = {};
        const client = resolveConnector(config, undefined, {
          budgetStatePath: tmpBudgetPath(),
          cacheDir: tmpCacheDir(),
          agentCliAvailable: () => true, // CLI is available — but guard should suppress auto-detect
        });

        // NoopAdapter returns modelUsed: "none"
        return client.complete([{ role: "user", content: "x" }]).then((r) => {
          expect(r.modelUsed).toBe("none");
          expect(r.text).toBe("");
        });
      });

      it("auto-selects agent-cli when LYSE_DISABLE_AGENT_AUTODETECT is NOT '1' and agentCliAvailable=true", async () => {
        // Delete the env var that the global setup sets, then restore it after
        const prev = process.env["LYSE_DISABLE_AGENT_AUTODETECT"];
        try {
          delete process.env["LYSE_DISABLE_AGENT_AUTODETECT"];

          const { AgentCliAdapter } = await import("../agent-cli-adapter.js");
          vi.spyOn(AgentCliAdapter.prototype, "complete").mockResolvedValue({
            text: "auto-agent-no-guard",
            usdSpent: 0,
            modelUsed: "claude-sonnet-4-6",
            llmQuality: "higher" as const,
            cacheHit: false,
          });

          const config: LyseConfig = {};
          const client = resolveConnector(config, undefined, {
            budgetStatePath: tmpBudgetPath(),
            cacheDir: tmpCacheDir(),
            agentCliAvailable: () => true,
          });
          const result = await client.complete([{ role: "user", content: "x" }]);
          expect(result.text).toBe("auto-agent-no-guard");
          vi.restoreAllMocks();
        } finally {
          if (prev !== undefined) {
            process.env["LYSE_DISABLE_AGENT_AUTODETECT"] = prev;
          } else {
            // Restore to "1" as the global setup expects
            process.env["LYSE_DISABLE_AGENT_AUTODETECT"] = "1";
          }
        }
      });
    });

    it("explicit provider:anthropic wins over agent-cli auto-default", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "msg_test",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "anthropic response" }],
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
      });
      const config: LyseConfig = { llm: { provider: "anthropic", model: "claude-sonnet-4-6" } };
      const client = resolveConnector(config, undefined, {
        budgetStatePath: tmpBudgetPath(),
        cacheDir: tmpCacheDir(),
        agentCliAvailable: () => true,
        fetchFn: fetchFn as unknown as typeof globalThis.fetch,
      });
      // The anthropic adapter is used — we just verify it doesn't use Noop
      // (actual network call is not made since we mock fetch above; but the adapter
      // itself uses the Anthropic SDK which doesn't use our fetchFn override the same
      // way — so we check the path selection by confirming agent-cli wasn't used
      // by checking llmQuality on a no-op check — instead mock AgentCliAdapter).
      const { AgentCliAdapter } = await import("../agent-cli-adapter.js");
      const agentSpy = vi.spyOn(AgentCliAdapter.prototype, "complete");
      // We don't await the call as it'd hit Anthropic SDK; just check it resolved the right adapter
      // by checking agentSpy was NOT called.
      // Use a spy that resolves instead of the real Anthropic SDK:
      const { AnthropicAdapter } = await import("../anthropic-adapter.js");
      vi.spyOn(AnthropicAdapter.prototype, "complete").mockResolvedValue({
        text: "anthropic",
        usdSpent: 0.001,
        modelUsed: "claude-sonnet-4-6",
        llmQuality: "higher",
        cacheHit: false,
      });
      const result = await client.complete([{ role: "user", content: "x" }]);
      expect(result.text).toBe("anthropic");
      expect(agentSpy).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    });
  });
});
