import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
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

  it("reads --x custom properties from a .scss snapshot (compiled DS mixin)", () => {
    // Real DS packages (e.g. @primer/primitives) ship `--x` custom properties
    // inside a .scss @mixin, not a .css file — this is the load-bearing path for N>1.
    const dir = pinsDir({ "dist/scss/colors/_light.scss": "@mixin colors { & { --brand: #f9826c; --z: 1400; } }" });
    const m = loadPinnedTokens(dir, ["dist/scss/colors/_light.scss"]);
    expect(m.get("--brand")).toEqual(["#f9826c"]); // custom property read from a .scss file
    expect(m.has("--z")).toBe(false); // non-colour dropped
  });

  it("reads a .json member snapshot (JS token lever)", () => {
    const dir = pinsDir({
      "tokens.json": JSON.stringify({ "base.orange400": "oklch(0.7261 0.1852 52.58 / 1)", "base.n": 5 }),
    });
    const m = loadPinnedTokens(dir, ["tokens.json"]);
    expect(m.get("base.orange400")).toEqual(["oklch(0.7261 0.1852 52.58 / 1)"]);
    expect(m.has("base.n")).toBe(false);
  });
});

describe("independence (ADR 0022 §3b)", () => {
  it("token-file + pinned-tokens import nothing from graph/resolve or a11y/contrast", () => {
    for (const f of ["./pinned-tokens.ts", "./token-file.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src).not.toMatch(/graph\/resolve/);
      expect(src).not.toMatch(/a11y\/contrast/);
    }
  });
});

describe("makePinnedResolveTokenValue", () => {
  it("resolves a ref from the pinned map before any in-repo lookup", async () => {
    const resolve = makePinnedResolveTokenValue("/no/such/repo", new Map([["$brand", ["#3b82f6"]]]));
    expect(await resolve("$brand", "deadbeef")).toEqual(["#3b82f6"]);
    expect(await resolve("var(--x)", "deadbeef")).toEqual([]); // not pinned, no in-repo git → []
  });

  it("resolves a JS member ref from a .json snapshot before any in-repo lookup", async () => {
    const resolve = makePinnedResolveTokenValue(
      "/no/such/repo",
      loadPinnedTokens(
        (() => {
          const d = mkdtempSync(join(tmpdir(), "lyse-pins-"));
          writeFileSync(join(d, "t.json"), JSON.stringify({ "base.orange400": "#fd7e00" }));
          return d;
        })(),
        ["t.json"],
      ),
    );
    expect(await resolve("base.orange400", "deadbeef")).toEqual(["#fd7e00"]);
  });
});
