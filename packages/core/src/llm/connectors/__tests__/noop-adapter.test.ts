import { describe, expect, it } from "vitest";
import { NoopAdapter } from "../noop-adapter.js";

describe("NoopAdapter", () => {
  it("returns empty text, zero cost, cacheHit false", async () => {
    const client = new NoopAdapter();
    const result = await client.complete([{ role: "user", content: "audit this repo" }]);
    expect(result.text).toBe("");
    expect(result.usdSpent).toBe(0);
    expect(result.cacheHit).toBe(false);
    expect(result.modelUsed).toBe("none");
    expect(result.llmQuality).toBe("lower");
  });

  it("ignores options and always returns the same shape", async () => {
    const client = new NoopAdapter();
    const r1 = await client.complete([], { estimateUsd: 99 });
    const r2 = await client.complete([{ role: "system", content: "x" }]);
    expect(r1.usdSpent).toBe(0);
    expect(r2.usdSpent).toBe(0);
  });
});
