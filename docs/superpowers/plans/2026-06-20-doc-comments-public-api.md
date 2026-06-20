# Doc-Comments Public-API Re-scope — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-scope `components/doc-comments` to flag only *public-API* components (those re-exported from a package entry), removing the corpus flood that got it demoted, so it can be re-promoted to the scored set (51 → 52).

**Architecture:** A new isolated resolver `loaders/public-exports.ts` resolves the set of public component names from `package.json` entries (Babel, no react-docgen). The rule computes that set once per evaluate and flags only components whose name ∈ the set. Empty/unresolvable set → N/A (0 findings) — precision over recall.

**Tech Stack:** TypeScript (strict), `@babel/parser` + `@babel/traverse`, `fast-glob`, vitest. Node `fs`/`path`.

## Global Constraints

- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` — all array/object index access must be guarded.
- No comments unless WHY is non-obvious.
- Deterministic output: sort name sets before any iteration that emits findings; findings already deterministic via file order.
- All artifacts in English.
- Reuse existing helpers: `isPathExcluded` (`_exclude.js`), `isLowSignalValueFile` (`_skip-context.js`), the `package.json` glob/read pattern from `components-contracts-strictness.ts`.
- The resolver MUST be side-effect-free except for reads under `repoRoot`; never read outside it; `node_modules`/`dist`/`build`/`.git` ignored.
- FP-first degradation: any read/parse failure or unresolvable entry contributes NOTHING (never throws, never flags).

---

### Task 1: `collectReExportedNames` — pure parser of one entry source

**Files:**
- Create: `packages/core/src/loaders/public-exports.ts`
- Test: `packages/core/tests/loaders/public-exports.test.ts`

**Interfaces:**
- Produces: `collectReExportedNames(source: string): { names: string[]; starFrom: string[] }`
  - `names`: PascalCase names made public by this file via `export { X }`, `export { Y as X }`, `export { default as X } from`, `export function X`, `export const X` (PascalCase only).
  - `starFrom`: raw module specifiers from `export * from "./x"` (to follow one level).
  - Parse failure → `{ names: [], starFrom: [] }`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { collectReExportedNames } from "../../src/loaders/public-exports.js";

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
    const r = collectReExportedNames(`export function Dialog() { return null; }\nexport const Tooltip = () => null;`);
    expect(r.names.sort()).toEqual(["Dialog", "Tooltip"]);
  });

  it("records `export * from` specifiers in starFrom", () => {
    const r = collectReExportedNames(`export * from './primitives';`);
    expect(r.starFrom).toEqual(["./primitives"]);
    expect(r.names).toEqual([]);
  });

  it("ignores non-PascalCase names (hooks, constants)", () => {
    const r = collectReExportedNames(`export { useButton } from './h';\nexport const DEFAULT = 1;`);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/loaders/public-exports.test.ts`
Expected: FAIL — `collectReExportedNames` not exported / file missing.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { parse as parseBabel } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name);
}

export function collectReExportedNames(source: string): { names: string[]; starFrom: string[] } {
  const names = new Set<string>();
  const starFrom: string[] = [];
  let ast: t.File;
  try {
    ast = parseBabel(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: false });
  } catch {
    return { names: [], starFrom: [] };
  }
  try {
    traverse(ast, {
      ExportNamedDeclaration(path) {
        if (path.node.exportKind === "type") return;
        const decl = path.node.declaration;
        if (decl) {
          if (decl.type === "FunctionDeclaration" && decl.id && isPascalCase(decl.id.name)) {
            names.add(decl.id.name);
          } else if (decl.type === "VariableDeclaration") {
            for (const d of decl.declarations) {
              if (d.id.type === "Identifier" && isPascalCase(d.id.name)) names.add(d.id.name);
            }
          }
          return;
        }
        for (const spec of path.node.specifiers) {
          if (spec.type !== "ExportSpecifier") continue;
          if ((spec as t.ExportSpecifier).exportKind === "type") continue;
          const exported = spec.exported;
          const exportedName = exported.type === "Identifier" ? exported.name : exported.value;
          if (isPascalCase(exportedName)) names.add(exportedName);
        }
      },
      ExportAllDeclaration(path) {
        if (path.node.exportKind === "type") return;
        if (path.node.source?.value) starFrom.push(path.node.source.value);
      },
    });
  } catch {
    return { names: [], starFrom: [] };
  }
  return { names: Array.from(names), starFrom };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/loaders/public-exports.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/loaders/public-exports.ts packages/core/tests/loaders/public-exports.test.ts
git commit -m "feat(loaders): collectReExportedNames — parse public re-exports from an entry source"
```

---

### Task 2: `resolvePackageEntry` — pick the source entry file for a package

**Files:**
- Modify: `packages/core/src/loaders/public-exports.ts`
- Test: `packages/core/tests/loaders/public-exports.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `resolvePackageEntry(packageDir: string, pkg: PackageEntryShape): string | null` — absolute path to the best SOURCE entry that exists on disk, or null. Priority: conventional `src/index.{tsx,ts,jsx,js}` → root `index.{tsx,ts,jsx,js}` → declared `module` → `main` → `types` → `exports["."]` (string, or object `import`/`module`/`default`/`types`). Returns the first whose resolved path exists.
  - `PackageEntryShape = { main?: unknown; module?: unknown; types?: unknown; typings?: unknown; exports?: unknown }`

- [ ] **Step 1: Write the failing test**

```typescript
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePackageEntry } from "../../src/loaders/public-exports.js";

function tmp(): string { return mkdtempSync(join(tmpdir(), "lyse-pe-")); }

describe("resolvePackageEntry", () => {
  it("prefers conventional src/index.ts when present", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "export {};");
    expect(resolvePackageEntry(dir, { main: "./dist/index.js" })).toBe(join(dir, "src", "index.ts"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to declared module field when no conventional entry", () => {
    const dir = tmp();
    mkdirSync(join(dir, "lib"));
    writeFileSync(join(dir, "lib", "main.ts"), "export {};");
    expect(resolvePackageEntry(dir, { module: "./lib/main.ts" })).toBe(join(dir, "lib", "main.ts"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("resolves exports['.'] object with an import condition", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "entry.tsx"), "export {};");
    expect(resolvePackageEntry(dir, { exports: { ".": { import: "./src/entry.tsx" } } })).toBe(join(dir, "src", "entry.tsx"));
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when nothing resolves to a real file", () => {
    const dir = tmp();
    expect(resolvePackageEntry(dir, { main: "./dist/index.js" })).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/loaders/public-exports.test.ts -t resolvePackageEntry`
Expected: FAIL — `resolvePackageEntry` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `public-exports.ts`:

```typescript
import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

export interface PackageEntryShape {
  main?: unknown;
  module?: unknown;
  types?: unknown;
  typings?: unknown;
  exports?: unknown;
}

const CONVENTIONAL = [
  "src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js",
  "index.tsx", "index.ts", "index.jsx", "index.js",
];

function exportsDotEntry(exportsField: unknown): string | null {
  if (typeof exportsField === "string") return exportsField;
  if (exportsField && typeof exportsField === "object") {
    const dot = (exportsField as Record<string, unknown>)["."];
    const target = dot === undefined ? exportsField : dot;
    if (typeof target === "string") return target;
    if (target && typeof target === "object") {
      for (const key of ["import", "module", "default", "types"]) {
        const v = (target as Record<string, unknown>)[key];
        if (typeof v === "string") return v;
      }
    }
  }
  return null;
}

function resolveRel(packageDir: string, rel: string): string {
  return isAbsolute(rel) ? rel : join(packageDir, rel);
}

export function resolvePackageEntry(packageDir: string, pkg: PackageEntryShape): string | null {
  for (const rel of CONVENTIONAL) {
    const abs = join(packageDir, rel);
    if (existsSync(abs)) return abs;
  }
  const candidates: unknown[] = [pkg.module, pkg.main, pkg.types, pkg.typings, exportsDotEntry(pkg.exports)];
  for (const c of candidates) {
    if (typeof c !== "string" || c.length === 0) continue;
    const abs = resolveRel(packageDir, c);
    if (existsSync(abs)) return abs;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/loaders/public-exports.test.ts -t resolvePackageEntry`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/loaders/public-exports.ts packages/core/tests/loaders/public-exports.test.ts
git commit -m "feat(loaders): resolvePackageEntry — source-first package entry resolution"
```

---

### Task 3: `resolvePublicComponentNames` — orchestrator (glob → resolve → parse → follow one `export *` level)

**Files:**
- Modify: `packages/core/src/loaders/public-exports.ts`
- Test: `packages/core/tests/loaders/public-exports.test.ts`

**Interfaces:**
- Consumes: `collectReExportedNames` (Task 1), `resolvePackageEntry` (Task 2).
- Produces: `resolvePublicComponentNames(repoRoot: string): Set<string>` — union of PascalCase public names across all non-ignored `package.json` packages. Follows `export * from` ONE level (parses the target file's named exports). Cycles/depth bounded by the one-level cap. Any failure degrades to contributing nothing. Empty `repoRoot` → empty set.

- [ ] **Step 1: Write the failing test**

```typescript
import { resolvePublicComponentNames } from "../../src/loaders/public-exports.js";

describe("resolvePublicComponentNames", () => {
  it("returns empty set for empty repoRoot", () => {
    expect(resolvePublicComponentNames("").size).toBe(0);
  });

  it("unions PascalCase public names across a package barrel", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ui", module: "./src/index.ts" }));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), `export { Button } from './button';\nexport { default as Card } from './card';`);
    const set = resolvePublicComponentNames(dir);
    expect(set.has("Button")).toBe(true);
    expect(set.has("Card")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("follows `export * from` one level", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ui", module: "./src/index.ts" }));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), `export * from './primitives';`);
    writeFileSync(join(dir, "src", "primitives.ts"), `export function Dialog() { return null; }\nexport const useDialog = () => null;`);
    const set = resolvePublicComponentNames(dir);
    expect(set.has("Dialog")).toBe(true);
    expect(set.has("useDialog")).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("does NOT follow `export *` a second level (documented limit)", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "ui", module: "./src/index.ts" }));
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
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", main: "./dist/index.js" }));
    expect(resolvePublicComponentNames(dir).size).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/loaders/public-exports.test.ts -t resolvePublicComponentNames`
Expected: FAIL — function not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `public-exports.ts`:

```typescript
import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import fg from "fast-glob";

const MAX_FILE_BYTES = 2_000_000;
const RESOLVE_EXTS = ["", ".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTS = ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"];

function readSmall(abs: string): string | null {
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function resolveModuleFile(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(fromFile), spec);
  for (const ext of RESOLVE_EXTS) {
    const abs = base + ext;
    const src = readSmall(abs);
    if (src !== null) return abs;
  }
  for (const ext of INDEX_EXTS) {
    const abs = base + ext;
    const src = readSmall(abs);
    if (src !== null) return abs;
  }
  return null;
}

function readPkg(abs: string): (PackageEntryShape & { private?: unknown }) | null {
  const raw = readSmall(abs);
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw) as PackageEntryShape & { private?: unknown };
  } catch {
    return null;
  }
}

export function resolvePublicComponentNames(repoRoot: string): Set<string> {
  const out = new Set<string>();
  if (!repoRoot) return out;
  let pkgs: string[] = [];
  try {
    pkgs = fg.sync(["**/package.json"], {
      cwd: repoRoot,
      absolute: true,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return out;
  }
  for (const pkgPath of pkgs.sort()) {
    const pkg = readPkg(pkgPath);
    if (!pkg) continue;
    const entry = resolvePackageEntry(dirname(pkgPath), pkg);
    if (!entry) continue;
    const entrySrc = readSmall(entry);
    if (entrySrc === null) continue;
    const { names, starFrom } = collectReExportedNames(entrySrc);
    for (const n of names) out.add(n);
    for (const spec of starFrom) {
      const target = resolveModuleFile(entry, spec);
      if (!target) continue;
      const tsrc = readSmall(target);
      if (tsrc === null) continue;
      for (const n of collectReExportedNames(tsrc).names) out.add(n);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/loaders/public-exports.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/loaders/public-exports.ts packages/core/tests/loaders/public-exports.test.ts
git commit -m "feat(loaders): resolvePublicComponentNames — monorepo public-export set (one-level export*)"
```

---

### Task 4: Re-scope `components/doc-comments` to the public set (with N/A degradation)

**Files:**
- Modify: `packages/core/src/rules/components-doc-comments.ts`
- Test: `packages/core/tests/rules/components-doc-comments.test.ts` (rewrite for new contract)

**Interfaces:**
- Consumes: `resolvePublicComponentNames(repoRoot)` (Task 3).
- Produces: re-scoped `evaluate`. New internal seam `evaluateDocComments(files, publicSet, ctx)` (pure given a set) so the rule is unit-testable without touching disk; `evaluate` wires `resolvePublicComponentNames(ctx.repoRoot)` into it. `_internal.evaluateDocComments` exported.
- Behavior: a found exported PascalCase component is an opportunity ONLY if its name ∈ publicSet; flagged when also undocumented. publicSet empty → 0 opportunities (N/A), 0 findings.

- [ ] **Step 1: Write the failing test** (rewrite the file)

```typescript
import { describe, it, expect } from "vitest";
import { _internal } from "../../src/rules/components-doc-comments.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(): RuleContext {
  return { repoRoot: "/r", tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function tsFile(path: string, source: string): ParsedTsFile {
  return { path, ast: null, source, imports: [] };
}
function makeParsed(files: { path: string; source: string }[]): ParsedFiles {
  return { ts: files.map((f) => tsFile(f.path, f.source)), css: [], cssInJs: [] };
}
function run(files: { path: string; source: string }[], pub: string[]) {
  return _internal.evaluateDocComments(makeParsed(files), new Set(pub), makeCtx());
}

describe("rule components/doc-comments — public-API re-scope", () => {
  it("flags a PUBLIC undocumented component", () => {
    const r = run([{ path: "Button.tsx", source: "export function Button() { return <button />; }" }], ["Button"]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("components/doc-comments");
    expect(r.opportunities).toBe(1);
  });

  it("does NOT flag a documented public component", () => {
    const r = run([{ path: "Button.tsx", source: "/** A button. */\nexport function Button() { return <button />; }" }], ["Button"]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(1);
  });

  it("does NOT flag an internal (non-public) component, nor count it", () => {
    const r = run([{ path: "Internal.tsx", source: "export function InternalThing() { return <i />; }" }], ["Button"]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("empty public set → N/A (0 findings, 0 opportunities) even with undocumented components", () => {
    const r = run([{ path: "Button.tsx", source: "export function Button() { return <button />; }" }], []);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("counts documented + undocumented public components as opportunities", () => {
    const r = run(
      [{ path: "two.tsx", source: "/** A. */\nexport function A() { return <i />; }\nexport function B() { return <i />; }" }],
      ["A", "B"],
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("B");
    expect(r.opportunities).toBe(2);
  });

  it("skips low-signal files even for public names", () => {
    const r = run([{ path: "Button.stories.tsx", source: "export function Button() { return <button />; }" }], ["Button"]);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("exposes the pure seam", () => {
    expect(typeof _internal.evaluateDocComments).toBe("function");
    expect(typeof _internal.scanComponentDocs).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/rules/components-doc-comments.test.ts`
Expected: FAIL — `_internal.evaluateDocComments` undefined.

- [ ] **Step 3: Write minimal implementation**

In `components-doc-comments.ts`: add the import, extract the pure seam, gate by the public set, and wire `evaluate`.

```typescript
import { resolvePublicComponentNames } from "../loaders/public-exports.js";
```

Replace the existing `evaluate` with:

```typescript
function evaluateDocComments(files: ParsedFiles, publicSet: Set<string>, ctx: RuleContext): RuleEvalResult {
  const findings: Finding[] = [];
  let opportunities = 0;
  if (publicSet.size === 0) return { findings, opportunities };

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (!/\.(tsx|jsx)$/.test(f.path)) continue;
    if (isLowSignalValueFile(f.path)) continue;
    if (!/\bexport\b/.test(f.source)) continue;

    for (const c of scanComponentDocs(f.source)) {
      if (!publicSet.has(c.componentName)) continue;
      opportunities++;
      if (c.documented) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "components",
        severity: "info",
        location: { file: f.path, line: c.line, column: c.column },
        message: `Exported component <${c.componentName}> has no doc comment — IDE tooltips and AI agents get no usage guidance`,
        suggestion: `add a JSDoc block (/** … */) above ${c.componentName} describing what it is and when to use it`,
      });
    }
  }
  return { findings, opportunities };
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const publicSet = resolvePublicComponentNames(ctx.repoRoot);
  return evaluateDocComments(files, publicSet, ctx);
};
```

Update `_internal` to expose `evaluateDocComments`:

```typescript
export const _internal = {
  scanComponentDocs,
  evaluateDocComments,
  COMPONENT_WRAPPERS,
};
```

Update the rule `fullDescription`/`rationale`/`allowlist` to state the public-API scope and N/A degradation (presence-only, public-API only, empty set → not scored).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run tests/rules/components-doc-comments.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Full suite + typecheck**

Run: `pnpm --filter @lyse-labs/lyse exec vitest run && pnpm --filter @lyse-labs/lyse exec tsc --noEmit`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/rules/components-doc-comments.ts packages/core/tests/rules/components-doc-comments.test.ts
git commit -m "feat(components): re-scope doc-comments to public-API components (#77)"
```

---

### Task 5: Corpus re-validation (precision gate — manual classify, NOT a code change)

**Files:** none (analysis). Artifacts written under `lyse-internal/internal/corpus-validation/`.

- [ ] **Step 1:** Rebuild core: `pnpm --filter @lyse-labs/lyse build`.
- [ ] **Step 2:** Re-clone the 5 DS if scratch was cleared (radix-ui/primitives, shadcn-ui/ui, tremorlabs/tremor, mantinedev/mantine, vercel/commerce) under `<scratchpad>/corpus/`.
- [ ] **Step 3:** For each, run `node packages/core/dist/cli.js audit <repo> --json > <repo>.audit.json` and extract `components/doc-comments` findings + opportunities.
- [ ] **Step 4:** Verify the flood is gone: shadcn/commerce should be ~N/A (no package barrel of components → empty/near-empty set); radix/tremor/mantine should yield a *bounded, meaningful* public-component count. Hand-classify a sample of findings TP/FP (target precision ≥ 0.90; 0 obvious FP).
- [ ] **Step 5:** Write `lyse-internal/internal/corpus-validation/2026-06-20-doc-comments-public-rescope-findings.md` with the before/after counts and the TP/FP classification. **Gate:** if any systematic FP class appears, STOP and fix (back to Task 1–4) — do not promote.

---

### Task 6: Adversarial code-review of the resolver

- [ ] **Step 1:** Dispatch the `requesting-code-review` flow on `public-exports.ts` + the re-scoped rule, with explicit FP-hunting angles: barrel cycles, `export type` leakage, re-exported non-components (PascalCase consts that aren't components), scoped-package paths, symlinked corpus, Windows path separators, huge monorepos (perf), `exports` subpath maps.
- [ ] **Step 2:** Triage each finding; fix real ones via TDD (new failing test → fix). Record verdicts.

---

### Task 7: Re-promotion (only if Tasks 5–6 clean)

**Files:**
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (flip `components.doc-comments` → `status:"stable", contributesToScore:true`)
- Modify: `packages/core/tests/reliability/v1-promotion.test.ts` (move `components.doc-comments` from `DEMOTED_*` to a promotion set; bump stable threshold 51 → 52)
- Modify: recall generators in `lyse-internal/internal/recall-suite/` (public-export fixtures: violation = public undocumented; compliant = public documented + internal undocumented)
- Modify: `docs/` scored tables, `CHANGELOG.md`, `lyse-internal` coverage-manifest status

- [ ] **Step 1:** Add recall generators; run `LYSE_RECALL_ONLY=components/doc-comments` runner; confirm recall LB ≥ 0.90 and precision LB ≥ 0.90.
- [ ] **Step 2:** Flip the sub-axis; update v1-promotion test (threshold 52); run full suite + smoke band re-check (`npx ... audit fixtures/full-ds/` stable score).
- [ ] **Step 3:** Sync docs + CHANGELOG + internal coverage-manifest; open public PR (assign `noemuch`, `Tracks lyse-labs/lyse-internal#NNN`) + internal PR.
- [ ] **Step 4:** Merge public first (squash) on green CI, then rerun internal coverage-gate, then merge internal.

---

## Self-Review

- **Spec coverage:** resolver (T1–3) ✓, re-scope + N/A (T4) ✓, corpus gate (T5) ✓, adversarial review (T6) ✓, re-promotion gate (T7) ✓. `export *` one-level limit encoded in T3 tests ✓.
- **Placeholders:** none — all code shown.
- **Type consistency:** `collectReExportedNames` / `resolvePackageEntry` / `resolvePublicComponentNames` / `evaluateDocComments` signatures consistent across tasks. `PackageEntryShape` defined in T2, reused in T3.
- **Honest limit:** `export *` >1 level not followed; non-standard entry layouts → empty set → N/A. Encoded in tests, documented in rule meta.
