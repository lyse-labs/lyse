import { DEFAULT_BUDGET_STATE_PATH, LLMBudget } from "../../reliability/llm-eval/budget.js";
import { DEFAULT_CACHE_DIR, ResponseCache } from "./cache.js";
import { NoopAdapter } from "./noop-adapter.js";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import { AnthropicAdapter } from "./anthropic-adapter.js";
import { AgentCliAdapter, isAgentCliAvailable } from "./agent-cli-adapter.js";
import { ConnectorNotImplementedError } from "./types.js";
import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";
import type { LyseConfig } from "../../types.js";
import type { AuditFlags } from "../../commands/audit-flags.js";

export interface ResolveConnectorOptions {
  budgetStatePath?: string;
  cacheDir?: string;
  fetchFn?: typeof globalThis.fetch;
  /**
   * Injectable availability check for the agent-cli binary.
   * Defaults to isAgentCliAvailable() (i.e. `claude --version` on PATH).
   * Override in tests to control auto-default behaviour without spawning a real process.
   */
  agentCliAvailable?: () => boolean;
}

class BudgetedCachedClient implements ConnectorClient {
  constructor(
    private readonly inner: ConnectorClient,
    private readonly budget: LLMBudget,
    private readonly cache: ResponseCache | null,
    private readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<ConnectorResult> {
    if (this.cache !== null) {
      const cached = await this.cache.get(this.model, messages);
      if (cached !== null) return cached;
    }

    const estimate =
      opts?.estimateUsd ??
      // Rough heuristic: total chars / 4 ≈ tokens, priced at conservative $0.015/1k input tokens.
      // Upper-bound so the budget guard fires before a frontier call, not after.
      (messages.reduce((sum, m) => sum + m.content.length, 0) / 4) * (0.015 / 1000);
    if (!this.budget.canSpend(estimate)) {
      return { text: "", usdSpent: 0, modelUsed: "none", llmQuality: "lower", cacheHit: false };
    }

    const result = await this.inner.complete(messages, opts);

    if (result.usdSpent > 0) {
      this.budget.record(result.usdSpent);
    }

    if (this.cache !== null) {
      try {
        await this.cache.set(this.model, messages, result);
      } catch {
        // Non-fatal: cache write failed (e.g. disk full / permission error). Return the result anyway.
      }
    }

    return result;
  }
}

function buildCache(
  llm: LyseConfig["llm"],
  opts: ResolveConnectorOptions,
  flags: AuditFlags | undefined,
): ResponseCache | null {
  if (flags?.noCache === true) return null;
  const maxAgeDays = llm?.cacheMaxAgeDays;
  if (maxAgeDays === undefined || maxAgeDays <= 0) return null;
  return new ResponseCache({
    cacheDir: opts.cacheDir ?? DEFAULT_CACHE_DIR,
    maxAgeDays,
  });
}

function buildBudget(
  llm: LyseConfig["llm"],
  flags: AuditFlags | undefined,
  opts: ResolveConnectorOptions,
): LLMBudget {
  const dailyUsd = flags?.costCapUsd ?? llm?.costCapUsd ?? 50;
  return new LLMBudget({
    dailyUsd,
    statePath: opts.budgetStatePath ?? DEFAULT_BUDGET_STATE_PATH,
  });
}

export function resolveConnector(
  config: LyseConfig,
  flags: AuditFlags | undefined,
  opts: ResolveConnectorOptions = {},
): ConnectorClient {
  const llm = config.llm;

  if (flags?.staticOnly === true) return new NoopAdapter();
  if (llm?.staticOnly === true) return new NoopAdapter();

  const provider = flags?.llmProvider ?? llm?.provider;
  const connector = llm?.connector;
  const model = flags?.llmModel ?? llm?.model;

  // Precedence for "no explicit provider/connector" case:
  // 1. --static-only (handled above) → Noop
  // 2. explicit provider: "none" → Noop
  // 3. explicit other provider/connector → handled below
  // 4. no provider at all, but `claude` CLI is on PATH → auto-select agent-cli (default-ON)
  //    This lets new users get free LLM augmentation without any API key config.
  //    Gated behind agentCliAvailable() so CI machines without `claude` stay Noop.
  // 5. no provider + CLI not available → Noop (original behaviour)
  if (provider === "none") return new NoopAdapter();

  if (!provider && !connector) {
    const checkAvailable = opts.agentCliAvailable ?? isAgentCliAvailable;
    if (checkAvailable()) {
      const agentModel = model ?? "claude-sonnet-4-6";
      const adapter = new AgentCliAdapter({ model: agentModel });
      const budget = buildBudget(llm, flags, opts);
      const cache = buildCache(llm, opts, flags);
      return new BudgetedCachedClient(adapter, budget, cache, agentModel);
    }
    return new NoopAdapter();
  }

  const budget = buildBudget(llm, flags, opts);
  const cache = buildCache(llm, opts, flags);

  if (connector === "mcp-host") {
    const mcpStub: ConnectorClient = {
      async complete(_messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> {
        throw new ConnectorNotImplementedError("mcp-host");
      },
    };
    return mcpStub;
  }

  if (provider === "agent-cli" || connector === "agent-cli") {
    const agentModel = model ?? "claude-sonnet-4-6";
    const adapter = new AgentCliAdapter({
      model: agentModel,
      binary: process.env["LYSE_AGENT_CLI_BINARY"] ?? "claude",
    });
    return new BudgetedCachedClient(adapter, budget, cache, agentModel);
  }

  if (
    connector === "ollama" ||
    (provider === "openai-compatible" && (llm?.endpoint?.includes("localhost") ?? false))
  ) {
    const ollamaModel = model ?? "llama3.2";
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "",
      model: ollamaModel,
      baseURL: llm?.endpoint ?? "http://localhost:11434/v1",
      ...(opts.fetchFn !== undefined && { fetchFn: opts.fetchFn }),
    });
    return new BudgetedCachedClient(adapter, budget, cache, ollamaModel);
  }

  if (
    connector === "openrouter" ||
    (provider === "openai-compatible" && (llm?.endpoint?.includes("openrouter.ai") ?? false))
  ) {
    const apiKey = process.env["OPENROUTER_API_KEY"] ?? "";
    const orModel = model ?? "openai/gpt-4o-mini";
    const adapter = new OpenAICompatibleAdapter({
      apiKey,
      model: orModel,
      baseURL: llm?.endpoint ?? "https://openrouter.ai/api/v1",
      ...(opts.fetchFn !== undefined && { fetchFn: opts.fetchFn }),
    });
    return new BudgetedCachedClient(adapter, budget, cache, orModel);
  }

  if (provider === "openai" || (connector === "direct-api-key" && provider === "openai")) {
    const apiKey = process.env["OPENAI_API_KEY"] ?? "";
    const oaiModel = model ?? "gpt-4o-mini";
    const adapter = new OpenAICompatibleAdapter({
      apiKey,
      model: oaiModel,
      baseURL: llm?.endpoint ?? "https://api.openai.com/v1",
      ...(opts.fetchFn !== undefined && { fetchFn: opts.fetchFn }),
    });
    return new BudgetedCachedClient(adapter, budget, cache, oaiModel);
  }

  if (provider === "anthropic" || (connector === "direct-api-key" && provider === "anthropic")) {
    const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
    const claudeModel = model ?? "claude-sonnet-4-6";
    const adapter = new AnthropicAdapter({
      apiKey,
      model: claudeModel,
      ...(opts.fetchFn !== undefined && { fetchFn: opts.fetchFn }),
    });
    return new BudgetedCachedClient(adapter, budget, cache, claudeModel);
  }

  if (provider === "auto") {
    const anthropicKey = process.env["ANTHROPIC_API_KEY"];
    if (anthropicKey) {
      const claudeModel = model ?? "claude-sonnet-4-6";
      const adapter = new AnthropicAdapter({
        apiKey: anthropicKey,
        model: claudeModel,
        ...(opts.fetchFn !== undefined && { fetchFn: opts.fetchFn }),
      });
      return new BudgetedCachedClient(adapter, budget, cache, claudeModel);
    }
    const openaiKey = process.env["OPENAI_API_KEY"];
    if (openaiKey) {
      const oaiModel = model ?? "gpt-4o-mini";
      const adapter = new OpenAICompatibleAdapter({
        apiKey: openaiKey,
        model: oaiModel,
        baseURL: "https://api.openai.com/v1",
        ...(opts.fetchFn !== undefined && { fetchFn: opts.fetchFn }),
      });
      return new BudgetedCachedClient(adapter, budget, cache, oaiModel);
    }
    return new NoopAdapter();
  }

  if (provider === "mcp") {
    return {
      async complete(_messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> {
        throw new ConnectorNotImplementedError("mcp");
      },
    };
  }

  return new NoopAdapter();
}
