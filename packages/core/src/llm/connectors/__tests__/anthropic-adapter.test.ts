import { describe, expect, it, vi } from "vitest";
import { AnthropicAdapter } from "../anthropic-adapter.js";

function mockAnthropicFetch(responseText: string, model: string) {
  const headers = new Headers({ "content-type": "application/json" });
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers,
    json: async () => ({
      id: "msg_01",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: responseText }],
      model,
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  });
}

describe("AnthropicAdapter", () => {
  it("returns text from a mock response", async () => {
    const fetch = mockAnthropicFetch("audit result", "claude-sonnet-4-6");
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    const result = await adapter.complete([{ role: "user", content: "run audit" }]);
    expect(result.text).toBe("audit result");
    expect(result.modelUsed).toBe("claude-sonnet-4-6");
    expect(result.cacheHit).toBe(false);
    expect(result.llmQuality).toBe("higher");
  });

  it("does NOT log or include the API key in any observable way", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    const consoleErrorSpy = vi.spyOn(console, "error");
    const consoleWarnSpy = vi.spyOn(console, "warn");
    const stderrSpy = vi.spyOn(process.stderr, "write");
    const fetch = mockAnthropicFetch("ok", "claude-haiku-3");
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-real-secret",
      model: "claude-haiku-3",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    await adapter.complete([{ role: "user", content: "x" }]);
    const allOutput = [
      ...consoleSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...stderrSpy.mock.calls,
    ]
      .flat()
      .join(" ");
    expect(allOutput).not.toContain("sk-ant-real-secret");
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("computes usdSpent from usage (non-zero)", async () => {
    const fetch = mockAnthropicFetch("ok", "claude-sonnet-4-6");
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    const result = await adapter.complete([{ role: "user", content: "x" }]);
    expect(result.usdSpent).toBeGreaterThan(0);
  });

  it("haiku call costs less than sonnet call for same token usage", async () => {
    const fetchHaiku = mockAnthropicFetch("ok", "claude-haiku-3-5");
    const fetchSonnet = mockAnthropicFetch("ok", "claude-sonnet-4-6");

    const haikuAdapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-haiku-3-5",
      fetchFn: fetchHaiku as unknown as typeof globalThis.fetch,
    });
    const sonnetAdapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetchSonnet as unknown as typeof globalThis.fetch,
    });

    const msgs = [{ role: "user" as const, content: "x" }];
    const haikuResult = await haikuAdapter.complete(msgs);
    const sonnetResult = await sonnetAdapter.complete(msgs);

    expect(haikuResult.usdSpent).toBeLessThan(sonnetResult.usdSpent);
  });

  it("rejects when the transport throws an error", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network failure"));
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    // The SDK may wrap the error (e.g. "Connection error."); assert it still rejects.
    await expect(adapter.complete([{ role: "user", content: "x" }])).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Track #145 — structured output + prompt caching
// ---------------------------------------------------------------------------

function mockToolUseFetch(input: unknown, opts?: { cacheRead?: number }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({
      id: "msg_02",
      type: "message",
      role: "assistant",
      content: [{ type: "tool_use", id: "tu_1", name: "emit_result", input }],
      model: "claude-sonnet-4-6",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: opts?.cacheRead ?? 0 },
    }),
  });
}

describe("AnthropicAdapter — structured output + caching (#145)", () => {
  it("forces a tool and returns the tool input as JSON text when responseSchema is set", async () => {
    const fetch = mockToolUseFetch({ verdicts: [{ index: 0, verdict: "fp", confidence: 0.9 }] });
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    const schema = { type: "object", properties: { verdicts: { type: "array" } } };
    const result = await adapter.complete([{ role: "user", content: "judge" }], { responseSchema: schema });

    // Returned text is valid JSON matching the tool input.
    expect(JSON.parse(result.text)).toEqual({ verdicts: [{ index: 0, verdict: "fp", confidence: 0.9 }] });

    // Request forced the tool.
    const body = JSON.parse((fetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.tools[0].name).toBe("emit_result");
    expect(body.tools[0].input_schema).toEqual(schema);
    expect(body.tool_choice).toEqual({ type: "tool", name: "emit_result" });
  });

  it("marks the system prefix cache_control: ephemeral", async () => {
    const fetch = mockAnthropicFetch("ok", "claude-sonnet-4-6");
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    await adapter.complete([
      { role: "system", content: "RUBRIC" },
      { role: "user", content: "x" },
    ]);
    const body = JSON.parse((fetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("reports cacheHit when the response read from cache", async () => {
    const fetch = mockToolUseFetch({ ok: true }, { cacheRead: 512 });
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-test",
      model: "claude-sonnet-4-6",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    const r = await adapter.complete([{ role: "user", content: "x" }], { responseSchema: { type: "object" } });
    expect(r.cacheHit).toBe(true);
  });
});
