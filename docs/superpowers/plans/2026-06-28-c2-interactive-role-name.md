# C2 — a11y/interactive-role-name — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `a11y/interactive-role-name` — wraps `jsx-a11y/control-has-associated-label` (accessible name on interactive controls), the one accessible-name rule `a11y/essentials` omits — born experimental/off-score.

**Architecture:** Mirror `a11y-essentials.ts`'s in-process ESLint + `eslint-plugin-jsx-a11y` harness, running ONLY `control-has-associated-label`. Map ESLint messages to Findings. Register + experimental honest-null catalogue.

**Tech Stack:** TypeScript (strict), vitest, `eslint` + `eslint-plugin-jsx-a11y` (already deps, used by essentials), `createLyseRule`, the reliability catalogue + gates.

## Global Constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax); ESM `.js` (note: jsx-a11y is CJS — mirror essentials' `require(...)` + eslint-disable pattern exactly).
- Determinism (ESLint on fixed input is deterministic); no Date.now()/Math.random(); `lastCalibrated: null`.
- Born `status: "experimental"`, `contributesToScore: false`. No score change. HONEST catalogue: all metrics null, nSamples 0 — adapter has NO `falseFriends` (so coherence allows null), like the program's other experimental rules.
- Zero overlap with `a11y/essentials`: wrap EXACTLY `jsx-a11y/control-has-associated-label` and nothing essentials already wraps.
- No LLM. No overfit. Rule via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes entry + coverage classification.
- Conventional Commits; branch `feat/color-to-90`. Trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`. English.

## File Structure

- `packages/core/src/rules/a11y-interactive-role-name.ts` — new rule (mirror `a11y-essentials.ts`).
- `registry.ts`, `sub-axes.ts`, coverage file, `rules-manifest.json` — register.
- Test + validation adapter + `docs/rules/a11y-interactive-role-name.md`.

---

## Task 1: the rule (mirror essentials' jsx-a11y harness, one rule)

**Files:**
- Create: `packages/core/src/rules/a11y-interactive-role-name.ts`
- Modify: `registry.ts`, `sub-axes.ts`, coverage file, `rules-manifest.json`
- Create: `packages/core/tests/rules/a11y-interactive-role-name.test.ts`, a validation adapter, `docs/rules/a11y-interactive-role-name.md`

**Interfaces:**
- Consumes: the ESLint + `eslint-plugin-jsx-a11y` harness pattern from `packages/core/src/rules/a11y-essentials.ts` (read it: the `require("eslint-plugin-jsx-a11y")` + flat-config `{ plugins: { "jsx-a11y": ... }, rules: {...} }` + lint-text-and-map-messages flow). `createLyseRule`, `ParsedFiles`, `Finding`.
- Produces: `lyseRuleId: "a11y/interactive-role-name"`, axis `a11y`, severity `warning`, running ONLY `"jsx-a11y/control-has-associated-label": "warn"`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/a11y-interactive-role-name.test.ts
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/a11y-interactive-role-name.js";
import { makeRuleContext, makeParsedFiles } from "../_helpers/rule-harness.js"; // adapt to the real harness (mirror a11y-essentials.test.ts)

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const run = (files: Record<string,string>) => rule.create().evaluate(makeRuleContext(), makeParsedFiles(files));

describe("a11y/interactive-role-name", () => {
  it("flags an icon-only button with no accessible name", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": "export const A = () => <button><svg/></button>;" });
    expect(res.findings.length).toBeGreaterThan(0);
  });
  it("does NOT flag a button with an aria-label", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": 'export const A = () => <button aria-label="Close"><svg/></button>;' });
    expect(res.findings).toHaveLength(0);
  });
  it("does NOT flag a button with text content", async () => {
    const res = await run({ "package.json": PKG, "A.tsx": "export const A = () => <button>Save</button>;" });
    expect(res.findings).toHaveLength(0);
  });
});
```

(Adapt `makeRuleContext`/`makeParsedFiles` — read `a11y-essentials.test.ts` for the exact harness essentials uses and copy it. The control-has-associated-label config may need `labelAttributes`/`controlComponents` defaults — use the jsx-a11y rule's defaults; `<button>` with no name should flag out of the box.)

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/rules/a11y-interactive-role-name.test.ts`) — module not found.

- [ ] **Step 3: Implement the rule**

Copy the harness structure from `a11y-essentials.ts` verbatim (the `require("eslint-plugin-jsx-a11y")` cast, the flat config, the lint-text + message→Finding mapping, the `opportunities` computation), changing only: the `A11Y_RULES` set to `["jsx-a11y/control-has-associated-label"]`, the `lyseRuleId` to `"a11y/interactive-role-name"`, and the meta block (shortDescription "Accessible name on interactive controls", fullDescription describing the wrapped rule + the essentials boundary, helpUri to the new doc, rationale, examples [icon-only button bad / aria-label'd good], allowlist). Findings: axis `a11y`, severity `warning`.

- [ ] **Step 4: Register + catalogue + coverage + manifest**

- `registry.ts`: import + ruleObjects.
- `sub-axes.ts`: `id: "a11y.interactive-role-name"`, axis a11y, status experimental, contributesToScore false, all metrics null, nSamples 0, lastCalibrated null, ruleIds `["a11y/interactive-role-name"]`, llmDriven false.
- coverage classification (mirror how `a11y/essentials` is classified).
- Regenerate `rules-manifest.json`.

- [ ] **Step 5: Adapter + green**

Construction-oracle adapter: clean = `<button>Save</button>` / `<button aria-label="x"><svg/></button>` (no flag); mutation = `<button><svg/></button>` (icon-only, flag). NO `falseFriends` (keep catalogue honestly null). Aim J=1 (clean=tn, mutation=tp). Run `cd packages/core && pnpm vitest run` (parity new count, uncovered=[], green); `pnpm validate:autonomous` → ENGINE GATE PASS.

- [ ] **Step 6: Docs + commit**

Create `docs/rules/a11y-interactive-role-name.md` (helpUri target — describe the wrapped rule + the essentials boundary, honest experimental note). Regenerate docs. Commit:

```bash
git add packages/core/src/rules/a11y-interactive-role-name.ts packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts <coverage> packages/core/rules-manifest.json packages/core/validation packages/core/tests/rules/a11y-interactive-role-name.test.ts docs/
git commit -m "feat(a11y): interactive-role-name rule (wraps jsx-a11y control-has-associated-label)"
```

---

## Task 2: CHANGELOG + changeset

- [ ] **Step 1:** CHANGELOG `[Unreleased] / Added`: the new socle rule (experimental, off-score; wraps jsx-a11y/control-has-associated-label — accessible name on interactive controls, the rule essentials omits).
- [ ] **Step 2:** `.changeset/socle-c2.md` (`minor`). No score change.
- [ ] **Step 3:** Commit `docs(changeset): C2 a11y/interactive-role-name`.

---

## Self-Review

**1. Spec coverage:** wraps control-has-associated-label (the omitted rule) → Task 1. Zero overlap (exactly that one rule) → Task 1 Step 3 + the boundary note. Mirror essentials harness → Task 1 Step 3. Honest null catalogue / no falseFriends → Task 1 Steps 4-5. Experimental/off-score → constraints + entry. ✓

**2. Placeholder scan:** "copy the harness from a11y-essentials.ts" + "adapt the test harness from a11y-essentials.test.ts" are concrete instructions against existing code (essentials IS the working template), not placeholders. Assertions concrete. All commands runnable.

**3. Type consistency:** `lyseRuleId`/`id`/`ruleIds` all `a11y/interactive-role-name` ↔ `a11y.interactive-role-name`. createLyseRule meta shape per the contract.

## Risks

- The jsx-a11y `control-has-associated-label` defaults: a bare `<button>` with only an SVG child should flag; verify in the RED test (Step 1). If the rule needs `controlComponents`/`labelComponents` config to fire on plain `<button>`, the default config flags native interactive elements — confirm with the test.
- Don't refactor `a11y-essentials.ts` (stable/scored) — copy its harness pattern into the new file (small duplication is acceptable; or extract a shared helper ONLY if trivially safe and essentials' tests stay green).
- 90% via the measurement campaign; ships experimental.
