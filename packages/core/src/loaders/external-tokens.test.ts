import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromExternalPackages, normalizeTokenPackages } from "./external-tokens.js";

function pkgRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lyse-ext-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("normalizeTokenPackages", () => {
  it("maps string and object forms to the object form", () => {
    expect(normalizeTokenPackages(["@a/x", { name: "@b/y", files: ["dist/*.css"] }])).toEqual([
      { name: "@a/x" },
      { name: "@b/y", files: ["dist/*.css"] },
    ]);
  });
  it("returns [] for undefined", () => {
    expect(normalizeTokenPackages(undefined)).toEqual([]);
  });
});

describe("fromExternalPackages", () => {
  it("extracts colour custom properties from a package's CSS", async () => {
    const root = pkgRepo({
      "node_modules/@acme/tokens/dist/css/tokens.css":
        ":root { --color-brand: #3b82f6; --z-modal: 1400; }",
    });
    const nodes = await fromExternalPackages(root, [{ name: "@acme/tokens" }]);
    expect(nodes).toEqual([
      {
        id: "@acme/tokens/dist/css/tokens.css#--color-brand",
        axis: "colors",
        rawValue: "#3b82f6",
        source: "external-package",
      },
    ]);
  });

  it("ignores non-colour custom properties (safety filter)", async () => {
    const root = pkgRepo({
      "node_modules/@acme/tokens/t.css": ":root { --z-modal: 1400; --spacing-4: 16px; }",
    });
    expect(await fromExternalPackages(root, [{ name: "@acme/tokens" }])).toEqual([]);
  });

  it("extracts colours from a JSON token file (Style-Dictionary / DTCG generic)", async () => {
    const root = pkgRepo({
      "node_modules/@acme/tokens/tokens.json": JSON.stringify({
        color: { brand: { $value: "#0090ff", $type: "color" } },
        flat: { accent: "#ff0000" },
        size: { md: "16px" },
      }),
    });
    const nodes = await fromExternalPackages(root, [{ name: "@acme/tokens" }]);
    expect(nodes.map((n) => [n.id, n.rawValue])).toEqual([
      ["@acme/tokens/tokens.json#color.brand", "#0090ff"],
      ["@acme/tokens/tokens.json#flat.accent", "#ff0000"],
    ]);
  });

  it("honours explicit `files` globs", async () => {
    const root = pkgRepo({
      "node_modules/@acme/tokens/dist/theme.css": ":root { --c: #010203; }",
      "node_modules/@acme/tokens/src/internal.css": ":root { --d: #040506; }",
    });
    const nodes = await fromExternalPackages(root, [{ name: "@acme/tokens", files: ["dist/**/*.css"] }]);
    expect(nodes.map((n) => n.rawValue)).toEqual(["#010203"]);
  });

  it("is fail-safe on a missing package (no throw, no output)", async () => {
    const root = pkgRepo({ "package.json": "{}" });
    expect(await fromExternalPackages(root, [{ name: "@not/installed" }])).toEqual([]);
  });

  it("is deterministic (sorted by id) and dedups nothing spuriously", async () => {
    const root = pkgRepo({
      "node_modules/@acme/tokens/b.css": ":root { --b: #222222; }",
      "node_modules/@acme/tokens/a.css": ":root { --a: #111111; }",
    });
    const nodes = await fromExternalPackages(root, [{ name: "@acme/tokens" }]);
    expect(nodes.map((n) => n.id)).toEqual([
      "@acme/tokens/a.css#--a",
      "@acme/tokens/b.css#--b",
    ]);
  });

  it("captures the last declaration in a minified rule (no trailing semicolon before })", async () => {
    const root = pkgRepo({
      "node_modules/@acme/tokens/dist.css": ":root{--a:#111111;--b:#222222}",
    });
    const nodes = await fromExternalPackages(root, [{ name: "@acme/tokens" }]);
    expect(nodes.map((n) => n.rawValue)).toEqual(["#111111", "#222222"]);
  });

  it("returns [] when no packages are configured (opt-in)", async () => {
    const root = pkgRepo({ "node_modules/@acme/tokens/t.css": ":root { --c: #010203; }" });
    expect(await fromExternalPackages(root, [])).toEqual([]);
  });

  it("is fail-safe on a traversal `name` that escapes node_modules (no throw, no output)", async () => {
    const root = pkgRepo({ "node_modules/@acme/tokens/t.css": ":root { --c: #010203; }" });
    expect(await fromExternalPackages(root, [{ name: "../evil" }])).toEqual([]);
  });
});
