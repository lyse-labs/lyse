import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleAdapter } from "../openai-compatible-adapter.js";

function mockFetch(responseText: string, model: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: responseText } }],
      model,
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
  });
}

describe("OpenAICompatibleAdapter", () => {
  it("returns text from a mock response", async () => {
    const fetch = mockFetch("design system score: 82", "gpt-4o-mini");
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "sk-test",
      model: "gpt-4o-mini",
      baseURL: "https://api.openai.com/v1",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await adapter.complete([{ role: "user", content: "audit" }]);

    expect(result.text).toBe("design system score: 82");
    expect(result.modelUsed).toBe("gpt-4o-mini");
    expect(result.cacheHit).toBe(false);
    expect(result.llmQuality).toBe("higher");
  });

  it("does NOT include the API key in the fetch call body", async () => {
    const fetch = mockFetch("ok", "gpt-4o");
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "sk-secret-key",
      model: "gpt-4o",
      baseURL: "https://api.openai.com/v1",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    await adapter.complete([{ role: "user", content: "x" }]);

    const [_url, init] = fetch.mock.calls[0] as [string, RequestInit];
    const bodyStr = typeof init.body === "string" ? init.body : "";
    expect(bodyStr).not.toContain("sk-secret-key");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-secret-key");
  });

  it("marks ollama (localhost) responses as llmQuality: lower", async () => {
    const fetch = mockFetch("ok", "llama3.2");
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "",
      model: "llama3.2",
      baseURL: "http://localhost:11434/v1",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    const result = await adapter.complete([{ role: "user", content: "x" }]);
    expect(result.llmQuality).toBe("lower");
    expect(result.usdSpent).toBe(0);
  });

  it("marks openrouter as llmQuality: higher", async () => {
    const fetch = mockFetch("ok", "openai/gpt-4o");
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "or-test",
      model: "openai/gpt-4o",
      baseURL: "https://openrouter.ai/api/v1",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    const result = await adapter.complete([{ role: "user", content: "x" }]);
    expect(result.llmQuality).toBe("higher");
  });

  it("throws when the API returns a non-200 response", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid API key" } }),
    });
    const adapter = new OpenAICompatibleAdapter({
      apiKey: "bad",
      model: "gpt-4o",
      baseURL: "https://api.openai.com/v1",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    await expect(
      adapter.complete([{ role: "user", content: "x" }]),
    ).rejects.toThrow("OpenAI-compatible API error 401");
  });
});
