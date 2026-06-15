import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  fetchFn?: typeof globalThis.fetch;
}

// Heuristic upper-bound rates (USD per 1M tokens). These are conservative estimates;
// actual pricing may differ. Used only for budget tracking, not billing.
const MODEL_RATES: Array<{
  pattern: RegExp;
  inputPer1M: number;
  outputPer1M: number;
}> = [
  { pattern: /haiku/i,  inputPer1M: 0.8,  outputPer1M: 4 },
  { pattern: /sonnet/i, inputPer1M: 3,    outputPer1M: 15 },
  { pattern: /opus/i,   inputPer1M: 15,   outputPer1M: 75 },
];

// Conservative default for unknown models.
const DEFAULT_RATE = { inputPer1M: 15, outputPer1M: 75 };

function rateForModel(model: string): { inputPer1M: number; outputPer1M: number } {
  for (const entry of MODEL_RATES) {
    if (entry.pattern.test(model)) return entry;
  }
  return DEFAULT_RATE;
}

function isTextBlock(b: Anthropic.ContentBlock): b is Anthropic.TextBlock {
  return b.type === "text";
}

function isToolUseBlock(b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock {
  return b.type === "tool_use";
}

const STRUCTURED_TOOL_NAME = "emit_result";

export class AnthropicAdapter implements ConnectorClient {
  private readonly client: Anthropic;

  constructor(private readonly opts: AnthropicAdapterOptions) {
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.fetchFn !== undefined && { fetch: opts.fetchFn }),
    });
  }

  async complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<ConnectorResult> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");
    const systemText = systemMessages.map((m) => m.content).join("\n");

    // Prompt caching (#145): mark the system/rubric prefix ephemeral so repeated
    // per-file calls in a multi-file audit reuse it instead of re-billing it.
    const system =
      systemText.length > 0
        ? [{ type: "text" as const, text: systemText, cache_control: { type: "ephemeral" as const } }]
        : undefined;

    // Structured output (#145): force a tool whose input matches the schema, so
    // the response is guaranteed valid JSON (no regex extraction downstream).
    const useStructured = opts?.responseSchema !== undefined;

    const response = await this.client.messages.create({
      model: this.opts.model,
      max_tokens: 4096,
      ...(system !== undefined && { system }),
      ...(useStructured && {
        tools: [
          {
            name: STRUCTURED_TOOL_NAME,
            description: "Emit the result as structured JSON.",
            input_schema: opts!.responseSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool" as const, name: STRUCTURED_TOOL_NAME },
      }),
      messages: conversationMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    let text: string;
    if (useStructured) {
      const toolBlock = response.content.find(isToolUseBlock);
      // Forced tool_choice guarantees a tool_use block; fall back to text defensively.
      text = toolBlock ? JSON.stringify(toolBlock.input) : response.content.filter(isTextBlock).map((b) => b.text).join("");
    } else {
      text = response.content.filter(isTextBlock).map((b) => b.text).join("");
    }

    const rate = rateForModel(this.opts.model);
    const usage = response.usage as Anthropic.Usage & { cache_read_input_tokens?: number };
    const usdSpent =
      response.usage.input_tokens * (rate.inputPer1M / 1_000_000) +
      response.usage.output_tokens * (rate.outputPer1M / 1_000_000);

    return {
      text,
      usdSpent,
      modelUsed: this.opts.model,
      llmQuality: "higher",
      cacheHit: (usage.cache_read_input_tokens ?? 0) > 0,
    };
  }
}
