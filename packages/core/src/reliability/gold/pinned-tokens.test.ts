import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPinnedTokens, makePinnedResolveTokenValue } from "./pinned-tokens.js";

function pinsDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-pins-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("loadPinnedTokens", () => {
  it("parses declared snapshot files into a merged ref→value map", () => {
    const dir = pinsDir({ "dist/tokens.scss": "$brand: #3b82f6;", "dist/theme.css": ":root{--accent:#ff0000}" });
    const m = loadPinnedTokens(dir, ["dist/tokens.scss", "dist/theme.css"]);
    expect(m.get("$brand")).toEqual(["#3b82f6"]);
    expect(m.get("--accent")).toEqual(["#ff0000"]);
  });
  it("skips missing files and unknown extensions without throwing", () => {
    const dir = pinsDir({ "a.scss": "$x: #111111;" });
    expect(loadPinnedTokens(dir, ["a.scss", "missing.css", "notes.txt"]).get("$x")).toEqual(["#111111"]);
  });
});

describe("makePinnedResolveTokenValue", () => {
  it("resolves a ref from the pinned map before any in-repo lookup", async () => {
    const resolve = makePinnedResolveTokenValue("/no/such/repo", new Map([["$brand", ["#3b82f6"]]]));
    expect(await resolve("$brand", "deadbeef")).toEqual(["#3b82f6"]);
    expect(await resolve("var(--x)", "deadbeef")).toEqual([]); // not pinned, no in-repo git → []
  });
});
