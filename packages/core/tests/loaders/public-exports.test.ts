import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectReExportedNames,
  resolvePackageEntry,
  resolvePublicComponentNames,
  resolvePublicExports,
  publicNamesForFile,
} from "../../src/loaders/public-exports.js";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "lyse-pe-"));
}

describe("collectReExportedNames", () => {
  it("collects named re-exports with a source", () => {
    const r = collectReExportedNames(`export { Button } from './button';`);
    expect(r.names).toEqual(["Button"]);
    expect(r.starFrom).toEqual([]);
  });

  it("collects `export { default as X } from`", () => {
    const r = collectReExportedNames(`export { default as Card } from './card';`);
    expect(r.names).toEqual(["Card"]);
  });

  it("collects `export { Local as Public }` aliasing (exported name wins)", () => {
    const r = collectReExportedNames(`export { internalBtn as Button } from './x';`);
    expect(r.names).toEqual(["Button"]);
  });

  it("collects local named exports without a source", () => {
    const r = collectReExportedNames(`import { Button } from './b';\nexport { Button };`);
    expect(r.names).toEqual(["Button"]);
  });

  it("collects local declared exports (function/const) when PascalCase", () => {
    const r = collectReExportedNames(
      `export function Dialog() { return null; }\nexport const Tooltip = () => null;`,
    );
    expect(r.names.sort()).toEqual(["Dialog", "Tooltip"]);
  });

  it("records `export * from` specifiers in starFrom", () => {
    const r = collectReExportedNames(`export * from './primitives';`);
    expect(r.starFrom).toEqual(["./primitives"]);
    expect(r.names).toEqual([]);
  });

  it("ignores non-PascalCase names (hooks, constants)", () => {
    const r = collectReExportedNames(
      `export { useButton } from './h';\nexport const DEFAULT = 1;`,
    );
    expect(r.names).toEqual([]);
  });

  it("ignores `export type { X }` type-only re-exports", () => {
    const r = collectReExportedNames(`export type { ButtonProps } from './button';`);
    expect(r.names).toEqual([]);
  });

  it("returns empty on parse failure", () => {
    const r = collectReExportedNames(`export { from from from`);
    expect(r).toEqual({ names: [], starFrom: [] });
  });
});

describe("resolvePackageEntry", () => {
  it("prefers conventional src/index.ts when present", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "export {};");
    expect(resolvePackageEntry(dir, { main: "./dist/index.js" })).toBe(
      join(dir, "src", "index.ts"),
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to declared module field when no conventional entry", () => {
    const dir = tmp();
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib", "main.ts"), "export {};");
    expect(resolvePackageEntry(dir, { module: "./lib/main.ts" })).toBe(
      join(dir, "lib", "main.ts"),
    );
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves exports['.'] object with an import condition", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "entry.tsx"), "export {};");
    expect(
      resolvePackageEntry(dir, { exports: { ".": { import: "./src/entry.tsx" } } }),
    ).toBe(join(dir, "src", "entry.tsx"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when nothing resolves to a real file", () => {
    const dir = tmp();
    expect(resolvePackageEntry(dir, { main: "./dist/index.js" })).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("resolvePublicComponentNames", () => {
  it("returns empty set for empty repoRoot", () => {
    expect(resolvePublicComponentNames("").size).toBe(0);
  });

  it("unions PascalCase public names across a package barrel", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "ui", module: "./src/index.ts" }),
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src", "index.ts"),
      `export { Button } from './button';\nexport { default as Card } from './card';`,
    );
    const set = resolvePublicComponentNames(dir);
    expect(set.has("Button")).toBe(true);
    expect(set.has("Card")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("follows `export * from` one level", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "ui", module: "./src/index.ts" }),
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), `export * from './primitives';`);
    writeFileSync(
      join(dir, "src", "primitives.ts"),
      `export function Dialog() { return null; }\nexport const useDialog = () => null;`,
    );
    const set = resolvePublicComponentNames(dir);
    expect(set.has("Dialog")).toBe(true);
    expect(set.has("useDialog")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does NOT follow `export *` a second level (documented limit)", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "ui", module: "./src/index.ts" }),
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), `export * from './a';`);
    writeFileSync(join(dir, "src", "a.ts"), `export * from './b';`);
    writeFileSync(join(dir, "src", "b.ts"), `export function Deep() { return null; }`);
    const set = resolvePublicComponentNames(dir);
    expect(set.has("Deep")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("yields empty set when no package.json resolves to a source entry", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "app", main: "./dist/index.js" }),
    );
    expect(resolvePublicComponentNames(dir).size).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("publicNamesForFile (per-package scoping)", () => {
  const index = {
    packages: [
      { dir: "packages/ui", names: new Set(["Button", "Card"]) },
      { dir: "apps/demo", names: new Set<string>() },
    ],
  };

  it("returns the owning package's names for a file inside it", () => {
    expect(publicNamesForFile(index, "packages/ui/src/Button.tsx").has("Button")).toBe(true);
  });

  it("does NOT leak a sibling package's public names (cross-package collision)", () => {
    // A demo `Button` in apps/demo must NOT be considered public just because
    // packages/ui exports a `Button`.
    expect(publicNamesForFile(index, "apps/demo/src/Button.tsx").has("Button")).toBe(false);
    expect(publicNamesForFile(index, "apps/demo/src/Button.tsx").size).toBe(0);
  });

  it("picks the deepest matching package when packages nest", () => {
    const nested = {
      packages: [
        { dir: "packages/ui", names: new Set(["Outer"]) },
        { dir: "packages/ui/sub", names: new Set(["Inner"]) },
      ],
    };
    const names = publicNamesForFile(nested, "packages/ui/sub/X.tsx");
    expect(names.has("Inner")).toBe(true);
    expect(names.has("Outer")).toBe(false);
  });

  it("returns empty set when no package owns the file", () => {
    expect(publicNamesForFile(index, "scripts/build.ts").size).toBe(0);
  });

  it("matches a root package (dir = '')", () => {
    const rootIdx = { packages: [{ dir: "", names: new Set(["Root"]) }] };
    expect(publicNamesForFile(rootIdx, "src/Root.tsx").has("Root")).toBe(true);
  });
});

describe("resolvePublicExports (per-package index)", () => {
  it("keeps each package's public names separate (no union leakage)", () => {
    const dir = tmp();
    // lib package exports Button
    mkdirSync(join(dir, "packages", "ui", "src"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "ui", "package.json"),
      JSON.stringify({ name: "ui", module: "./src/index.ts" }),
    );
    writeFileSync(join(dir, "packages", "ui", "src", "index.ts"), `export { Button } from './button';`);
    // private app declares its own demo Button but exports nothing
    mkdirSync(join(dir, "apps", "demo"), { recursive: true });
    writeFileSync(
      join(dir, "apps", "demo", "package.json"),
      JSON.stringify({ name: "demo", private: true }),
    );

    const index = resolvePublicExports(dir);
    const ui = index.packages.find((p) => p.dir === "packages/ui");
    const demo = index.packages.find((p) => p.dir === "apps/demo");
    expect(ui?.names.has("Button")).toBe(true);
    expect(demo === undefined || demo.names.size === 0).toBe(true);
    // a demo file must not see Button as public
    expect(publicNamesForFile(index, "apps/demo/Button.tsx").has("Button")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolvePublicComponentNames still returns the union (backward compat)", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "ui", module: "./src/index.ts" }),
    );
    writeFileSync(join(dir, "src", "index.ts"), `export { Button } from './b';\nexport { Card } from './c';`);
    const union = resolvePublicComponentNames(dir);
    expect(union.has("Button")).toBe(true);
    expect(union.has("Card")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
