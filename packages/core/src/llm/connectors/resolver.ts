import { DEFAULT_BUDGET_STATE_PATH, LLMBudget } from "../../reliability/llm-eval/budget.js";
import { DEFAULT_CACHE_DIR, ResponseCache } from "./cache.js";
import { NoopAdapter } from "./noop-adapter.js";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter.js";
import { AnthropicAdapter } from "./anthropic-adapter.js";
import { ConnectorNotImplementedError } from "./types.js";
import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";
import type { LyseConfig } from "../../types.js";
import type { AuditFlags } from "../../commands/audit-flags.js";

export interface ResolveConnectorOptions {
  budgetStatePath?: string;
  cacheDir?: string;
  fetchFn?: typeof globalThis.fetch;
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

    const estimate = opts?.estimateUsd ?? 0.01;
    if (!this.budget.canSpend(estimate)) {
      return { text: "", usdSpent: 0, modelUsed: "none", llmQuality: "lower", cacheHit: false };
    }

    const result = await this.inner.complete(messages, opts);

    if (result.usdSpent > 0) {
      this.budget.record(result.usdSpent);
    }

    if (this.cache !== null) {
      await this.cache.set(this.model, messages, result);
    }

    return result;
  }
}

function buildCache(llm: LyseConfig["llm"], opts: ResolveConnectorOptions): ResponseCache | null {
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
  if (!llm?.provider && !llm?.connector) return new NoopAdapter();

  const budget = buildBudget(llm, flags, opts);
  const cache = buildCache(llm, opts);

  const provider = flags?.llmProvider ?? llm?.provider;
  const connector = llm?.connector;
  const model = flags?.llmModel ?? llm?.model;

  if (connector === "mcp-host") {
    const mcpStub: ConnectorClient = {
      async complete(_messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> {
        throw new ConnectorNotImplementedError("mcp-host");
      },
    };
    return mcpStub;
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

  return new NoopAdapter();
}
