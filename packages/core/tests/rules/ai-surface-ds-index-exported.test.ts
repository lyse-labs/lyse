import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-surface-ds-index-exported.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string, componentsModule: string | null = null): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
}

function setupWorkspace(root: string, packageName: string, packageDir: string) {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
  );
  mkdirSync(join(root, packageDir, "src"), { recursive: true });
  writeFileSync(
    join(root, packageDir, "package.json"),
    JSON.stringify({ name: packageName }),
  );
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-ds-index-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule ai-surface/ds-index-exported", () => {
  it("is N/A when componentsModule is not configured", async () => {
    const result = await rule.evaluate(makeCtx(tmp, null), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("is N/A when componentsModule is not a workspace package (external library)", async () => {
    // No workspace match for @external/lib
    const result = await rule.evaluate(makeCtx(tmp, "@external/lib"), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("emits a warning when the DS package has no index file", async () => {
    setupWorkspace(tmp, "@acme/ui", "packages/ui");
    // No index.ts written
    const result = await rule.evaluate(makeCtx(tmp, "@acme/ui"), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.message).toContain("no index entry");
  });

  it("emits a warning when the DS index has no export statements", async () => {
    setupWorkspace(tmp, "@acme/ui", "packages/ui");
    writeFileSync(join(tmp, "packages/ui/src/index.ts"), "const x = 1;\n");
    const result = await rule.evaluate(makeCtx(tmp, "@acme/ui"), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("no `export` statements");
  });

  it("emits 0 findings when index has ≥3 named exports", async () => {
    setupWorkspace(tmp, "@acme/ui", "packages/ui");
    writeFileSync(
      join(tmp, "packages/ui/src/index.ts"),
      [
        "export { Button } from './button';",
        "export { Card } from './card';",
        "export { Modal } from './modal';",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp, "@acme/ui"), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("emits 0 findings when index uses `export *` (treated as opaque-but-valid)", async () => {
    setupWorkspace(tmp, "@acme/ui", "packages/ui");
    writeFileSync(
      join(tmp, "packages/ui/src/index.ts"),
      "export * from './components';\n",
    );
    const result = await rule.evaluate(makeCtx(tmp, "@acme/ui"), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits a warning when index has only 1 named export (below threshold)", async () => {
    setupWorkspace(tmp, "@acme/ui", "packages/ui");
    writeFileSync(
      join(tmp, "packages/ui/src/index.ts"),
      "export const Button = () => null;\n",
    );
    const result = await rule.evaluate(makeCtx(tmp, "@acme/ui"), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toContain("exports only 1 name(s)");
  });

  it("supports pnpm-workspace.yaml when package.json has no workspaces", async () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "root", private: true }));
    writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
    mkdirSync(join(tmp, "packages/ui/src"), { recursive: true });
    writeFileSync(
      join(tmp, "packages/ui/package.json"),
      JSON.stringify({ name: "@acme/ui" }),
    );
    writeFileSync(
      join(tmp, "packages/ui/src/index.ts"),
      [
        "export { A } from './a';",
        "export { B } from './b';",
        "export { C } from './c';",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp, "@acme/ui"), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("does not emit when repoRoot is missing", async () => {
    const ctx: RuleContext = { ...makeCtx(tmp, "@acme/ui"), repoRoot: "" };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("analyseExports counts star re-exports, named re-exports, and named declarations", () => {
    const src = [
      "export * from './foo';",
      "export { A, B as C } from './bar';",
      "export const D = 1;",
      "export function E() {}",
      "export type F = string;",
    ].join("\n");
    const surface = _internal.analyseExports(src);
    expect(surface.starReexports).toBe(1);
    expect(surface.exportedNames.has("A")).toBe(true);
    expect(surface.exportedNames.has("C")).toBe(true);
    expect(surface.exportedNames.has("D")).toBe(true);
    expect(surface.exportedNames.has("E")).toBe(true);
    expect(surface.exportedNames.has("F")).toBe(true);
  });

  it("analyseExports returns empty for no-export file", () => {
    const surface = _internal.analyseExports("const x = 1;\nconsole.log(x);");
    expect(surface.starReexports).toBe(0);
    expect(surface.exportedNames.size).toBe(0);
  });
});
