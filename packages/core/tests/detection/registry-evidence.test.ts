import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registryDeclaredDirs } from "../../src/detection/registry-evidence.js";

const APPS = ["apps/docs/**", "apps/www/**", "apps/*.dev/**", "apps/*.com/**"];

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lyse-registry-evidence-"));
});

function writeJson(rel: string, value: unknown): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, JSON.stringify(value));
}

function writeSource(rel: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "export const X = 1;");
}

/** The shape shadcn-style registries actually ship. */
function registry(paths: string[]): unknown {
  return {
    homepage: "https://example.test",
    items: paths.map((p, i) => ({ files: [{ path: p, type: "registry:ui" }], name: `item-${i}`, type: "registry:ui" })),
    name: "example",
  };
}

describe("registryDeclaredDirs", () => {
  it("returns the directories a resolving registry.json names, relative to the repo root", async () => {
    writeSource("apps/www/registry/ui/button.tsx");
    writeSource("apps/www/registry/lib/utils.ts");
    writeJson("apps/www/registry.json", registry(["registry/ui/button.tsx", "registry/lib/utils.ts"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual(["apps/www/registry/lib", "apps/www/registry/ui"]);
  });

  it("names a directory the registry declares even when only some of its files are listed — a stale entry is the repo's, not ours", async () => {
    writeSource("apps/www/registry/ui/button.tsx");
    writeSource("apps/www/registry/ui/card.tsx");
    writeJson("apps/www/registry.json", registry(["registry/ui/button.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual(["apps/www/registry/ui"]);
  });

  it("ignores a registry whose declared paths do not resolve relative to its own directory (the built copy under public/, and magicui's root aggregate, both resolve 0)", async () => {
    writeSource("apps/www/registry/ui/button.tsx");
    // Paths written for a different base — they name real files, but not from here.
    writeJson("apps/www/public/r/registry.json", registry(["registry/ui/button.tsx"]));
    writeJson("registry.json", registry(["registry/ui/button.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  it("ignores malformed JSON without throwing", async () => {
    mkdirSync(join(root, "apps", "www"), { recursive: true });
    writeFileSync(join(root, "apps", "www", "registry.json"), "{ not json");

    await expect(registryDeclaredDirs(root, APPS)).resolves.toEqual([]);
  });

  it("ignores a registry.json with no items array, and item entries that are not file objects", async () => {
    writeSource("apps/www/registry/ui/button.tsx");
    writeJson("apps/docs/registry.json", { name: "x" });
    writeJson("apps/www/registry.json", { items: [null, 3, { files: "nope" }, { files: [{ path: 7 }, null] }] });

    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  it("refuses a declared path that escapes the directory the registry sits in", async () => {
    writeSource("packages/secret/leak.tsx");
    mkdirSync(join(root, "apps", "www"), { recursive: true });
    writeJson("apps/www/registry.json", registry(["../../packages/secret/leak.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  // symlinkSync requires elevated privilege / developer mode on Windows.
  it.skipIf(process.platform === "win32")("refuses a declared path that escapes via a symlink out of the directory", async () => {
    writeSource("packages/secret/leak.tsx");
    mkdirSync(join(root, "apps", "www"), { recursive: true });
    symlinkSync(join(root, "packages", "secret"), join(root, "apps", "www", "linked"), "dir");
    writeJson("apps/www/registry.json", registry(["linked/leak.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  it("ignores a declared path that is a directory rather than a file", async () => {
    mkdirSync(join(root, "apps", "www", "registry", "ui"), { recursive: true });
    writeJson("apps/www/registry.json", registry(["registry/ui"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  it("only looks inside the directories the caller names — a registry.json elsewhere is not evidence here", async () => {
    writeSource("examples/registry/ui/button.tsx");
    writeJson("examples/registry.json", registry(["registry/ui/button.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  it("resolves the wildcard shapes in the patterns it is given (apps/*.dev, apps/*.com)", async () => {
    writeSource("apps/example.dev/registry/ui/a.tsx");
    writeJson("apps/example.dev/registry.json", registry(["registry/ui/a.tsx"]));
    writeSource("apps/example.com/registry/ui/b.tsx");
    writeJson("apps/example.com/registry.json", registry(["registry/ui/b.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual([
      "apps/example.com/registry/ui",
      "apps/example.dev/registry/ui",
    ]);
  });

  it("returns nothing on a repository with no apps/ directory at all", async () => {
    writeSource("src/button.tsx");
    expect(await registryDeclaredDirs(root, APPS)).toEqual([]);
  });

  it("returns a sorted, de-duplicated list", async () => {
    writeSource("apps/www/registry/ui/b.tsx");
    writeSource("apps/www/registry/ui/a.tsx");
    writeSource("apps/docs/registry/ui/c.tsx");
    writeJson("apps/www/registry.json", registry(["registry/ui/b.tsx", "registry/ui/a.tsx"]));
    writeJson("apps/docs/registry.json", registry(["registry/ui/c.tsx"]));

    expect(await registryDeclaredDirs(root, APPS)).toEqual(["apps/docs/registry/ui", "apps/www/registry/ui"]);
  });
});
