# B2a — components/no-style-escape-hatch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag an inline `style={...}` prop on a DS component (resolved via the configured `componentsModule` / component inventory / manifest) — a value-agnostic structural bypass of the component's prop API — born experimental/off-score.

**Architecture:** A small pure DS-component resolver (`isDsComponent`, reusable substrate for B2b) + the rule that walks JSX `style` attributes via ts-morph and consults it. Skips `dsSelfMode`. Honest catalogue (starts unmeasured); real-code precision measured later targeting ≥0.90.

**Tech Stack:** TypeScript (strict), vitest, ts-morph (shared project), `createLyseRule`, the reliability catalogue + parity/coverage gates, the validation engine.

## Global Constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax); ESM `.js`.
- Determinism byte-for-byte; no Date.now()/Math.random(); `lastCalibrated: null` while unmeasured.
- Born `status: "experimental"`, `contributesToScore: false`. No score change in B2a. HONEST catalogue: precision/recall/Wilson LBs `null`, `nSamples: 0` (real detector — real precision is a later harvest, NOT a synthetic number).
- Recall-safety toward NOT over-flagging: unresolvable tag / no `componentsModule` & no manifest / `ctx.dsSelfMode === true` → do NOT flag. Raw HTML and non-DS components → never flagged. Value-agnostic (flag the `style` prop presence on a DS component, regardless of contents).
- Zero overlap: only the `style`-prop presence; `className` arbitrary = `components/no-arbitrary-tailwind`; values = the token rules.
- No LLM in the score. No overfit (resolver general — no sample-repo names).
- Rule metadata via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes entry + coverage classification (parity + completeness gates).
- Conventional Commits; branch `feat/color-to-90`. Trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`. English.

## File Structure

- `packages/core/src/rules/_ds-component.ts` — new pure resolver `isDsComponent`.
- `packages/core/src/rules/components-no-style-escape-hatch.ts` — new rule.
- `registry.ts`, `sub-axes.ts`, the coverage classification file, `rules-manifest.json` — register.
- Tests + a validation adapter.

---

## Task 1: `isDsComponent` resolver (reusable substrate)

**Files:**
- Create: `packages/core/src/rules/_ds-component.ts`
- Test: `packages/core/tests/rules/ds-component-resolver.test.ts`

**Interfaces:**
- Consumes: a ts-morph `SourceFile` (or its imports), and the relevant `RuleContext` fields (`componentsModule: string | null`, `componentInventory: ComponentInventoryEntry[]` where each is `{ name, module, usageCount }`).
- Produces: `isDsComponent(tagName: string, sourceFile: SourceFile, ctx: { componentsModule: string | null; componentInventory: { name: string; module: string }[] }): boolean`. True iff `tagName` is imported in `sourceFile` from `ctx.componentsModule`, OR `tagName` appears in `ctx.componentInventory` (same DS module). PascalCase JSX tags only (lowercase = raw HTML → false).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/ds-component-resolver.test.ts
import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { isDsComponent } from "../../src/rules/_ds-component.js";

function sf(code: string) {
  const p = new Project({ useInMemoryFileSystem: true });
  return p.createSourceFile("f.tsx", code);
}
const ctx = (mod: string | null) => ({ componentsModule: mod, componentInventory: [{ name: "Card", module: "@org/ui" }] });

describe("isDsComponent", () => {
  it("true when the tag is imported from componentsModule", () => {
    const s = sf(`import { Button } from "@org/ui";\nexport const X = () => <Button/>;`);
    expect(isDsComponent("Button", s, ctx("@org/ui"))).toBe(true);
  });
  it("false for a lowercase raw HTML tag", () => {
    const s = sf(`export const X = () => <div/>;`);
    expect(isDsComponent("div", s, ctx("@org/ui"))).toBe(false);
  });
  it("false for a local PascalCase component not from the DS", () => {
    const s = sf(`const MyThing = () => null;\nexport const X = () => <MyThing/>;`);
    expect(isDsComponent("MyThing", s, ctx("@org/ui"))).toBe(false);
  });
  it("true when the tag is in the component inventory (DS module)", () => {
    const s = sf(`export const X = () => <Card/>;`);
    expect(isDsComponent("Card", s, ctx("@org/ui"))).toBe(true);
  });
  it("false when no componentsModule and not in inventory", () => {
    const s = sf(`import { Button } from "@org/ui";\nexport const X = () => <Button/>;`);
    expect(isDsComponent("Button", s, { componentsModule: null, componentInventory: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/rules/ds-component-resolver.test.ts`) — module not found.

- [ ] **Step 3: Implement `_ds-component.ts`**

`isDsComponent(tagName, sourceFile, ctx)`: return false if `tagName` is not PascalCase (`/^[A-Z]/`). If `ctx.componentInventory.some(e => e.name === tagName)` → true. Else inspect `sourceFile.getImportDeclarations()`: for each, if `ctx.componentsModule` is set AND the import's module specifier === `ctx.componentsModule` AND its named/default imports include `tagName` → true. Else false. Pure; no I/O beyond the passed SourceFile; deterministic.

- [ ] **Step 4: Green** (`pnpm vitest run tests/rules/ds-component-resolver.test.ts` → 5 pass).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/_ds-component.ts packages/core/tests/rules/ds-component-resolver.test.ts
git commit -m "feat(rules): isDsComponent resolver (DS-component substrate for escape-hatch + prefer-existing)"
```

---

## Task 2: `components/no-style-escape-hatch` rule

**Files:**
- Create: `packages/core/src/rules/components-no-style-escape-hatch.ts`
- Modify: `registry.ts`, `sub-axes.ts`, coverage file, `rules-manifest.json`
- Create: test + validation adapter

**Interfaces:**
- Consumes: `isDsComponent` (Task 1); ts-morph from the shared project / the parsed `ts` files in `ParsedFiles` (mirror how `tokens-no-hardcoded-color.ts` / `_color-ast-role.ts` reach the AST); `RuleContext` (`componentsModule`, `componentInventory`, `dsSelfMode`).
- Produces: `lyseRuleId: "components/no-style-escape-hatch"`, axis `components`, severity `warning`. Flags `<X style={...}>` where `isDsComponent(X, …)`. opportunities = DS-component JSX elements inspected.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/components-no-style-escape-hatch.test.ts
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-no-style-escape-hatch.js";
import { makeRuleContext, makeParsedFiles } from "../_helpers/rule-harness.js"; // adapt to the real harness

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const run = (files: Record<string,string>, ctxOverrides = {}) =>
  rule.create().evaluate(makeRuleContext({ componentsModule: "@org/ui", componentInventory: [], ...ctxOverrides }), makeParsedFiles(files));

describe("components/no-style-escape-hatch", () => {
  it("flags inline style on a DS component", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button style={{ color: "red" }} />;' });
    expect(res.findings.some(f => f.message.includes("Button"))).toBe(true);
  });
  it("does NOT flag inline style on raw HTML", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": 'export const A = () => <div style={{ color: "red" }} />;' });
    expect(res.findings).toHaveLength(0);
  });
  it("does NOT flag a DS component WITHOUT style", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button variant="primary" />;' });
    expect(res.findings).toHaveLength(0);
  });
  it("does NOT flag in dsSelfMode", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": 'import {Button} from "@org/ui";\nexport const A = () => <Button style={{ color: "red" }} />;' }, { dsSelfMode: true });
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });
});
```

(Adapt `makeRuleContext`/`makeParsedFiles` to the repo's real harness — read an existing rule test.)

- [ ] **Step 2: Run → fail** (module not found).

- [ ] **Step 3: Implement the rule**

`createLyseRule`. In `evaluate(ctx, parsed)`: if `ctx.dsSelfMode === true` → return `{ findings: [], opportunities: 0 }`. If `ctx.componentsModule == null && ctx.componentInventory.length === 0` → return empty (no DS to identify). For each parsed TS/TSX source (use the shared ts-morph project the same way `_color-ast-role.ts`/the color rule do), find every `JsxOpeningElement`/`JsxSelfClosingElement`; get its tag name; if `isDsComponent(tag, sourceFile, ctx)` → it's an opportunity; if it has a `style` JSX attribute → emit finding "Inline `style` on DS component `<tag>` bypasses its prop API — use the component's styling props/tokens." Respect `_skip-context`/`isPathExcluded` (stories/tests/vendored). `opportunities` = DS-component elements inspected. meta block per convention, axis `components`, severity `warning`.

- [ ] **Step 4: Register + catalogue + coverage + manifest**

- `registry.ts`: import + add to `ruleObjects`.
- `sub-axes.ts`: entry `id: "components.no-style-escape-hatch"`, axis `components`, `status: "experimental"`, `contributesToScore: false`, **all metrics null, nSamples 0, lastCalibrated null** (real detector — unmeasured), `ruleIds: ["components/no-style-escape-hatch"]`, `llmDriven: false`.
- coverage classification: classify (it's a warning detector → covered-by-adapter fits).
- Regenerate `rules-manifest.json`.

- [ ] **Step 5: Adapter + green**

Construction-oracle adapter: clean fixture (`<Button variant="x"/>` from @org/ui = no flag) + mutations (`<Button style={{...}}/>` = flag) + false-friends (`<div style={{}}/>` raw HTML = no flag; DS component without style = no flag). Aim J=1. Run `cd packages/core && pnpm vitest run` (parity new count, uncovered=[], green); `pnpm validate:autonomous` → ENGINE GATE PASS.

- [ ] **Step 6: Docs + commit**

Create `docs/rules/components-no-style-escape-hatch.md` (helpUri target) per convention; regenerate sub-axes/coverage docs. Commit:

```bash
git add packages/core/src/rules/components-no-style-escape-hatch.ts packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts <coverage> packages/core/rules-manifest.json packages/core/validation packages/core/tests/rules/components-no-style-escape-hatch.test.ts docs/
git commit -m "feat(components): no-style-escape-hatch rule (inline style on a DS component bypasses its API)"
```

---

## Task 3: CHANGELOG + changeset

- [ ] **Step 1:** CHANGELOG `[Unreleased] / Added`: the new socle rule (experimental, off-score; flags inline style on DS components; real-world precision pending harvest).
- [ ] **Step 2:** `.changeset/socle-b2a.md` (`minor`, alpha convention). No score change.
- [ ] **Step 3:** Commit `docs(changeset): B2a no-style-escape-hatch`.

---

## Self-Review

**1. Spec coverage:**
- Flag inline style on DS component, value-agnostic → Task 2. ✓
- DS-component resolution (componentsModule / inventory / manifest) → Task 1 (`isDsComponent`). ✓ (Note: spec also allows manifest-listed components; Task 1 uses componentsModule import + inventory. If the harvest shows manifest-only DS components are missed, extend `isDsComponent` to also consult the parsed manifest — recorded as a follow-up; inventory+import covers the common case.)
- Raw HTML / non-DS / no-style / dsSelfMode not flagged → Task 2 Step 3 + tests. ✓
- Zero overlap (style-prop only) → Task 2. ✓
- Experimental / honest unmeasured catalogue → Task 2 Step 4. ✓
- Reusable resolver substrate for B2b → Task 1. ✓

**2. Placeholder scan:** The test harness (`makeRuleContext`/`makeParsedFiles`) is "adapt to the real harness" — a concrete instruction (the harness exists; match an existing rule test); assertions are concrete. The manifest-extension of `isDsComponent` is explicitly a recorded follow-up, not a gap (inventory+import is the shipped scope). All commands runnable.

**3. Type consistency:** `isDsComponent(tagName, sourceFile, ctx)` signature consistent across Task 1 (def) + Task 2 (use). `RuleContext.dsSelfMode`/`componentsModule`/`componentInventory` match `src/types.ts:95-110`. `ComponentInventoryEntry` = `{ name, module, usageCount }`.

## Risks

- DS-component resolution edge cases (re-exports/barrels/aliases) → conservative (unresolved → not flagged, recall-safe toward under-flagging non-DS).
- 90% empirical → measured on real code later; honest experimental until then.
- dsSelfMode must be honored (Task 2 Step 3 first line) or the DS repo floods with FPs.
