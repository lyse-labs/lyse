import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadManifest } from "../manifest-loader.js";
import type { ConfidenceManifest } from "../../types.js";

const FALLBACK: ConfidenceManifest = {
  version: "scoring-v1",
  generatedAt: "",
  validFrom: "",
  validUntil: "",
  subAxes: {},
};

const FRESH: ConfidenceManifest = {
  version: "scoring-v1",
  generatedAt: "2026-05-22T00:00:00Z",
  validFrom: "2026-05-22T00:00:00Z",
  validUntil: "2026-12-31T23:59:59Z",
  subAxes: { "tokens.color": { precision: 0.92, recall: 0.88, nSamples: 120 } },
};

describe("manifest loader", () => {
  let cacheDir: string;
  let cacheFile: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "lyse-manifest-"));
    cacheFile = resolve(cacheDir, "manifest.json");
  });
  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("falls back to bundled defaults if network fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );
    const m = await loadManifest({ url: "http://invalid.invalid/manifest", fallback: FALLBACK, cacheDir });
    expect(m.version).toBe("scoring-v1");
    expect(m).toEqual(FALLBACK);
  });

  it("writes to cache after a successful fetch", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(FRESH), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadManifest({ url: "https://api.getlyse.com/v1/manifest", fallback: FALLBACK, cacheDir });
    expect(m).toEqual(FRESH);
    const persisted = JSON.parse(readFileSync(cacheFile, "utf8"));
    expect(persisted).toEqual(FRESH);
  });

  it("reads from cache if cache is < 7 days old (no network call)", async () => {
    writeFileSync(cacheFile, JSON.stringify(FRESH), "utf8");
    const fetchMock = vi.fn(() => Promise.reject(new Error("should not be called")));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadManifest({ url: "https://api.getlyse.com/v1/manifest", fallback: FALLBACK, cacheDir });
    expect(m).toEqual(FRESH);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-fetches if cache is stale (> 7 days)", async () => {
    writeFileSync(cacheFile, JSON.stringify({ ...FRESH, generatedAt: "stale" }), "utf8");
    const eightDaysAgo = (Date.now() - 8 * 24 * 60 * 60 * 1000) / 1000;
    utimesSync(cacheFile, eightDaysAgo, eightDaysAgo);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(FRESH), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    const m = await loadManifest({ url: "https://api.getlyse.com/v1/manifest", fallback: FALLBACK, cacheDir });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(m).toEqual(FRESH);
  });

  it("honors pinnedDate query string", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(new Response(JSON.stringify({ ...FRESH, _url: url }), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await loadManifest({
      url: "https://api.getlyse.com/v1/manifest",
      fallback: FALLBACK,
      pinnedDate: "2026-04",
      cacheDir,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.getlyse.com/v1/manifest?pinned=2026-04",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("falls back to bundled defaults if fetch returns non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))),
    );
    const m = await loadManifest({ url: "https://api.getlyse.com/v1/manifest", fallback: FALLBACK, cacheDir });
    expect(m).toEqual(FALLBACK);
  });

  it("falls back on JSON parse error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("not-json{{{", { status: 200 }))),
    );
    const m = await loadManifest({ url: "https://api.getlyse.com/v1/manifest", fallback: FALLBACK, cacheDir });
    expect(m).toEqual(FALLBACK);
  });

  it("respects LYSE_CACHE_DIR env override when cacheDir is not passed", async () => {
    const prev = process.env["LYSE_CACHE_DIR"];
    process.env["LYSE_CACHE_DIR"] = cacheDir;
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response(JSON.stringify(FRESH), { status: 200 }))),
      );
      const m = await loadManifest({ url: "https://api.getlyse.com/v1/manifest", fallback: FALLBACK });
      expect(m).toEqual(FRESH);
      const persisted = JSON.parse(readFileSync(cacheFile, "utf8"));
      expect(persisted).toEqual(FRESH);
    } finally {
      if (prev === undefined) delete process.env["LYSE_CACHE_DIR"];
      else process.env["LYSE_CACHE_DIR"] = prev;
    }
  });
});
