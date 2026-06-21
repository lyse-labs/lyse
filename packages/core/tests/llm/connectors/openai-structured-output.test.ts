import { describe, it, expect } from "vitest";
import { OpenAICompatibleAdapter } from "../../../src/llm/connectors/openai-compatible-adapter.js";

const SCHEMA = {
  type: "object",
  properties: { verdicts: { type: "array" } },
  required: ["verdicts"],
};

function mockFetch(captured: { body?: unknown }): typeof globalThis.fetch {
  return (async (_url: string, init?: { body?: string }) => {
    captured.body = init?.body ? JSON.parse(init.body) : undefined;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"verdicts":[]}' } }],
        model: "gpt-4o-mini",
      }),
    };
  }) as unknown as typeof globalThis.fetch;
}

describe("OpenAICompatibleAdapter — structured output (#145)", () => {
  it("sends response_format json_schema when responseSchema is provided", async () => {
    const captured: { body?: unknown } = {};
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "k",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      fetchFn: mockFetch(captured),
    });
    await adapter.complete([{ role: "user", content: "x" }], { responseSchema: SCHEMA });
    const body = captured.body as { response_format?: { type: string; json_schema?: { schema?: unknown } } };
    expect(body.response_format?.type).toBe("json_schema");
    expect(body.response_format?.json_schema?.schema).toEqual(SCHEMA);
  });

  it("omits response_format when no responseSchema is provided", async () => {
    const captured: { body?: unknown } = {};
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "k",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      fetchFn: mockFetch(captured),
    });
    await adapter.complete([{ role: "user", content: "x" }]);
    const body = captured.body as { response_format?: unknown };
    expect(body.response_format).toBeUndefined();
  });
});
