import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOLDEN_CORPUS } from "./corpus.js";
import { fetchGoldenRepo, goldenCacheDir } from "./fetch.js";

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

  it("a failed fetch returns null and leaves no poisoned cache dir", async () => {
    const bad = {
      ...GOLDEN_CORPUS[0]!,
      sha: "0000000000000000000000000000000000000000",
      url: "https://codeload.github.com/carbon-design-system/carbon/tar.gz/0000000000000000000000000000000000000000",
    };
    const p = await fetchGoldenRepo(bad);
    expect(p).toBeNull();
    const dest = join(goldenCacheDir(), `carbon-design-system__carbon-${bad.sha}`);
    expect(existsSync(dest)).toBe(false); // not poisoned
  }, 60_000);
});
