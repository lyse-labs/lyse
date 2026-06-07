import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResponseCache } from "../cache.js";
import type { ChatMessage, ConnectorResult } from "../types.js";

const MESSAGES: ChatMessage[] = [{ role: "user", content: "hello" }];
const MODEL = "gpt-4o-mini";

const RESULT: ConnectorResult = {
  text: "world",
  usdSpent: 0.001,
  modelUsed: MODEL,
  llmQuality: "higher",
  cacheHit: false,
};

function makeCache(maxAgeDays: number) {
  const dir = mkdtempSync(join(tmpdir(), "lyse-cache-"));
  return new ResponseCache({ cacheDir: dir, maxAgeDays });
}

describe("ResponseCache", () => {
  it("returns null on cache miss", async () => {
    const cache = makeCache(7);
    const hit = await cache.get(MODEL, MESSAGES);
    expect(hit).toBeNull();
  });

  it("returns a hit after set, with cacheHit: true and usdSpent: 0", async () => {
    const cache = makeCache(7);
    await cache.set(MODEL, MESSAGES, RESULT);
    const hit = await cache.get(MODEL, MESSAGES);
    expect(hit).not.toBeNull();
    expect(hit!.cacheHit).toBe(true);
    expect(hit!.usdSpent).toBe(0);
    expect(hit!.text).toBe("world");
    expect(hit!.modelUsed).toBe(MODEL);
  });

  it("returns null for an expired entry", async () => {
    const cache = makeCache(0);
    await cache.set(MODEL, MESSAGES, RESULT);
    const hit = await cache.get(MODEL, MESSAGES);
    expect(hit).toBeNull();
  });

  it("produces identical cache keys regardless of message array reference", async () => {
    const cache = makeCache(7);
    const msgs1: ChatMessage[] = [{ role: "user", content: "hello" }];
    const msgs2: ChatMessage[] = [{ role: "user", content: "hello" }];
    await cache.set(MODEL, msgs1, RESULT);
    const hit = await cache.get(MODEL, msgs2);
    expect(hit).not.toBeNull();
  });
});
