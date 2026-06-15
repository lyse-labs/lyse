export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  estimateUsd?: number;
  /**
   * JSON Schema for the response (Track #145). On SDK adapters this forces a
   * tool call whose input matches the schema → the returned `text` is always
   * valid JSON (no regex extraction / parse-error fallback). Ignored by the
   * stateless agent-cli / noop adapters.
   */
  responseSchema?: Record<string, unknown>;
}

export interface ConnectorResult {
  text: string;
  usdSpent: number;
  modelUsed: string;
  llmQuality: "higher" | "lower";
  cacheHit: boolean;
}

export interface ConnectorClient {
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<ConnectorResult>;
}

export class ConnectorNotImplementedError extends Error {
  override name = "ConnectorNotImplementedError";
  constructor(connector: string) {
    super(`Connector "${connector}" is not implemented in this version of Lyse.`);
  }
}

export class ConnectorBudgetExceededError extends Error {
  override name = "ConnectorBudgetExceededError";
  constructor(estimateUsd: number, dailyCap: number) {
    super(
      `LLM call refused: estimated cost $${estimateUsd.toFixed(4)} would exceed daily cap $${dailyCap.toFixed(2)}.`,
    );
  }
}
