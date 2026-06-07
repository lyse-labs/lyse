import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  fetchFn?: typeof globalThis.fetch;
}

const INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

export class AnthropicAdapter implements ConnectorClient {
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicAdapterOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.fetchFn !== undefined && { fetch: opts.fetchFn }),
    });
  }

  async complete(messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");
    const systemText = systemMessages.map((m) => m.content).join("\n");

    const response = await this.client.messages.create({
      model: this.opts.model,
      max_tokens: 4096,
      ...(systemText.length > 0 && { system: systemText }),
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const text =
      response.content
        .filter((b) => b.type === "text")
        .map((b) => ("text" in b ? (b as { text: string }).text : ""))
        .join("") ?? "";

    const usdSpent =
      response.usage.input_tokens * INPUT_USD_PER_TOKEN +
      response.usage.output_tokens * OUTPUT_USD_PER_TOKEN;

    return {
      text,
      usdSpent,
      modelUsed: this.opts.model,
      llmQuality: "higher",
      cacheHit: false,
    };
  }
}
