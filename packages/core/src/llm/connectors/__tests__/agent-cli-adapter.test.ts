import { describe, expect, it } from "vitest";
import { AgentCliAdapter, isAgentCliAvailable } from "../agent-cli-adapter.js";
import type { AgentCliSpawnFn } from "../agent-cli-adapter.js";

function makeSpawnFn(overrides: {
  text?: string;
  usdSpent?: number;
  error?: Error;
  capturedInput?: { binary: string; model: string; systemPrompt: string; userPrompt: string }[];
}): AgentCliSpawnFn {
  return async (input) => {
    if (overrides.capturedInput) overrides.capturedInput.push(input);
    if (overrides.error) throw overrides.error;
    return { text: overrides.text ?? "hello", usdSpent: overrides.usdSpent ?? 0 };
  };
}

describe("AgentCliAdapter", () => {
  it("returns text and usdSpent from spawnFn", async () => {
    const adapter = new AgentCliAdapter({
      model: "claude-opus-4",
      spawnFn: makeSpawnFn({ text: "verdict: good", usdSpent: 0.0042 }),
    });
    const result = await adapter.complete([{ role: "user", content: "audit this" }]);
    expect(result.text).toBe("verdict: good");
    expect(result.usdSpent).toBe(0.0042);
    expect(result.modelUsed).toBe("claude-opus-4");
    expect(result.llmQuality).toBe("higher");
    expect(result.cacheHit).toBe(false);
  });

  it("passes correct args to spawnFn: model, binary, system/user split", async () => {
    const captured: { binary: string; model: string; systemPrompt: string; userPrompt: string }[] = [];
    const adapter = new AgentCliAdapter({
      model: "claude-sonnet-4-6",
      binary: "claude",
      spawnFn: makeSpawnFn({ text: "ok", capturedInput: captured }),
    });
    await adapter.complete([
      { role: "system", content: "You are a DS auditor." },
      { role: "user", content: "Check this component." },
      { role: "assistant", content: "Sure." },
      { role: "user", content: "Focus on a11y." },
    ]);
    expect(captured).toHaveLength(1);
    const call = captured[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call.binary).toBe("claude");
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.systemPrompt).toBe("You are a DS auditor.");
    expect(call.userPrompt).toBe("Check this component.\n\nSure.\n\nFocus on a11y.");
  });

  it("joins multiple system messages with double newline", async () => {
    const captured: { binary: string; model: string; systemPrompt: string; userPrompt: string }[] = [];
    const adapter = new AgentCliAdapter({
      model: "claude-haiku-4",
      spawnFn: makeSpawnFn({ text: "ok", capturedInput: captured }),
    });
    await adapter.complete([
      { role: "system", content: "Instruction A" },
      { role: "system", content: "Instruction B" },
      { role: "user", content: "Go." },
    ]);
    const call = captured[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call.systemPrompt).toBe("Instruction A\n\nInstruction B");
    expect(call.userPrompt).toBe("Go.");
  });

  it("works with no system messages", async () => {
    const captured: { binary: string; model: string; systemPrompt: string; userPrompt: string }[] = [];
    const adapter = new AgentCliAdapter({
      model: "claude-sonnet-4-6",
      spawnFn: makeSpawnFn({ text: "ok", capturedInput: captured }),
    });
    await adapter.complete([{ role: "user", content: "just a user prompt" }]);
    const call = captured[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call.systemPrompt).toBe("");
    expect(call.userPrompt).toBe("just a user prompt");
  });

  it("propagates spawn errors", async () => {
    const adapter = new AgentCliAdapter({
      model: "claude-sonnet-4-6",
      spawnFn: makeSpawnFn({ error: new Error("claude CLI spawn failed: ENOENT") }),
    });
    await expect(
      adapter.complete([{ role: "user", content: "x" }]),
    ).rejects.toThrow("claude CLI spawn failed: ENOENT");
  });

  it("defaults usdSpent to 0 when spawnFn returns 0", async () => {
    const adapter = new AgentCliAdapter({
      model: "claude-sonnet-4-6",
      spawnFn: makeSpawnFn({ text: "result", usdSpent: 0 }),
    });
    const result = await adapter.complete([{ role: "user", content: "x" }]);
    expect(result.usdSpent).toBe(0);
  });
});

describe("isAgentCliAvailable", () => {
  it("returns a boolean (does not throw)", () => {
    // On machines without `claude` this returns false; on machines with it, true.
    // We only assert the return type to avoid coupling tests to the host environment.
    const result = isAgentCliAvailable("_nonexistent_binary_lyse_test_");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });

  it("returns false for a binary that does not exist", () => {
    expect(isAgentCliAvailable("__lyse_definitely_not_on_path__")).toBe(false);
  });
});
