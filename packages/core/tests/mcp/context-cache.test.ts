import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getProjectContext,
  clearProjectContextCache,
  _contextCacheSize,
} from "../../src/mcp/context-cache.js";

let dir: string;
beforeEach(() => {
  clearProjectContextCache();
  dir = mkdtempSync(join(tmpdir(), "lyse-ctx-cache-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
});

describe("getProjectContext", () => {
  it("returns the SAME cached object on a second call within TTL", async () => {
    const a = await getProjectContext(dir, { ttlMs: 10_000 });
    const b = await getProjectContext(dir, { ttlMs: 10_000 });
    expect(b).toBe(a);
  });

  it("reloads (new object) once the entry is older than the TTL", async () => {
    const a = await getProjectContext(dir, { ttlMs: 0 });
    const b = await getProjectContext(dir, { ttlMs: 0 });
    expect(b).not.toBe(a);
  });

  it("clearProjectContextCache forces a reload", async () => {
    const a = await getProjectContext(dir, { ttlMs: 10_000 });
    clearProjectContextCache();
    const b = await getProjectContext(dir, { ttlMs: 10_000 });
    expect(b).not.toBe(a);
  });

  it("caches per project root independently", async () => {
    const dir2 = mkdtempSync(join(tmpdir(), "lyse-ctx-cache2-"));
    writeFileSync(join(dir2, "package.json"), JSON.stringify({ name: "y", version: "1.0.0" }));
    const a = await getProjectContext(dir, { ttlMs: 10_000 });
    const b = await getProjectContext(dir2, { ttlMs: 10_000 });
    expect(b).not.toBe(a);
    expect(_contextCacheSize()).toBe(2);
  });

  it("exposes the loaded context shape (tokens, storyIndex, config)", async () => {
    const ctx = await getProjectContext(dir, { ttlMs: 10_000 });
    expect(ctx).toHaveProperty("tokens");
    expect(ctx).toHaveProperty("storyIndex");
    expect(ctx).toHaveProperty("config");
  });
});
