import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOLDEN_CORPUS } from "./corpus.js";
import { fetchGoldenRepo } from "./fetch.js";

const NET = process.env.LYSE_GOLDEN === "1";
describe.runIf(NET)("fetchGoldenRepo (network)", () => {
  it("extracts a pinned repo and caches it (2nd call is offline-safe)", async () => {
    const repo = GOLDEN_CORPUS[0]!;
    const p1 = await fetchGoldenRepo(repo);
    expect(p1).not.toBeNull();
    expect(existsSync(p1!)).toBe(true);
    const p2 = await fetchGoldenRepo(repo); // cache hit
    expect(p2).toBe(p1);
  }, 120_000);
});
