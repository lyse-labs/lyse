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
    const stderrSpy = vi.spyOn(process.stderr, "write");
    const fetch = mockAnthropicFetch("ok", "claude-haiku-3");
    const adapter = new AnthropicAdapter({
      apiKey: "sk-ant-real-secret",
      model: "claude-haiku-3",
      fetchFn: fetch as unknown as typeof globalThis.fetch,
    });
    await adapter.complete([{ role: "user", content: "x" }]);
    const allOutput = [...consoleSpy.mock.calls, ...stderrSpy.mock.calls].flat().join(" ");
    expect(allOutput).not.toContain("sk-ant-real-secret");
    consoleSpy.mockRestore();
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
});
