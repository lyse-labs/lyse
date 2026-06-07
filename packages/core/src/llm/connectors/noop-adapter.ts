import type { ChatMessage, CompleteOptions, ConnectorClient, ConnectorResult } from "./types.js";

export class NoopAdapter implements ConnectorClient {
  async complete(_messages: ChatMessage[], _opts?: CompleteOptions): Promise<ConnectorResult> {
    return {
      text: "",
      usdSpent: 0,
      modelUsed: "none",
      llmQuality: "lower",
      cacheHit: false,
    };
  }
}
