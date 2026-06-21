import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
  model: string;
  usage?: OpenAIUsage;
}

export interface OpenAICompatibleAdapterOptions {
  apiKey: string;
  model: string;
  baseURL: string;
  fetchFn?: typeof globalThis.fetch;
}

const LOCALHOST_RE = /^https?:\/\/localhost|^https?:\/\/127\./;

function isLocalEndpoint(baseURL: string): boolean {
  return LOCALHOST_RE.test(baseURL);
}

function estimateUsd(usage: OpenAIUsage | undefined, baseURL: string): number {
  if (isLocalEndpoint(baseURL) || !usage) return 0;
  const total = usage.prompt_tokens + usage.completion_tokens;
  return (total / 1_000_000) * 0.15;
}

export class OpenAICompatibleAdapter implements ConnectorClient {
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(private readonly opts: OpenAICompatibleAdapterOptions) {
    this.fetchFn = opts.fetchFn ?? globalThis.fetch;
  }

  async complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<ConnectorResult> {
    const url = `${this.opts.baseURL.replace(/\/$/, "")}/chat/completions`;
    // #145: schema-constrained output. OpenAI-compatible APIs honour
    // response_format json_schema; providers that ignore it degrade to free
    // text, which the caller already parses defensively (extractJson).
    const payload: Record<string, unknown> = { model: this.opts.model, messages };
    if (opts?.responseSchema) {
      payload["response_format"] = {
        type: "json_schema",
        json_schema: { name: "lyse_structured_output", schema: opts.responseSchema, strict: false },
      };
    }
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.opts.apiKey) {
      headers["Authorization"] = `Bearer ${this.opts.apiKey}`;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible API error ${response.status} from ${this.opts.baseURL}`,
      );
    }

    const data = (await response.json()) as OpenAIResponse;
    const text = data.choices[0]?.message.content ?? "";
    const local = isLocalEndpoint(this.opts.baseURL);

    return {
      text,
      usdSpent: estimateUsd(data.usage, this.opts.baseURL),
      modelUsed: this.opts.model,
      llmQuality: local ? "lower" : "higher",
      cacheHit: false,
    };
  }
}
