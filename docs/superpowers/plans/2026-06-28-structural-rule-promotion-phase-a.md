# Structural-rule promotion Phase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Find the first promotable rules. For each experimental deterministic-structural rule: tighten away its removable semantic FP, harden a comprehensive adversarial validator (≥35 positives, J=1, Wilson LB ≥ 0.90), and confirm on the bench corpus with a deterministic re-check. Phase A is measured/off-score; the score flip is Phase B (post-#223-merge). Prove on `stories/props-documented` first; if it clears both gates, scale to the others; if it can't be made bounded, record it for Solution 2 (LLM filter).

**Architecture:** Per spec `docs/superpowers/specs/2026-06-28-structural-rule-promotion-design.md`. The key difference from the (failed) detector proofs: these rules' FP is REMOVABLE with deterministic context (the component inventory's `props`/`variants`), so after tightening they have no semantic gap → the validator proof is honest and the deterministic auto-label confirmation is non-circular.

**Tech Stack:** TS (strict), vitest, the autonomous engine + catalogue-coherence keystone, `wilsonLowerBound`, `auto-label.ts`, `scripts/measure-rules.ts`, the component inventory (`ComponentInventoryEntry.props`).

## Global Constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax); ESM `.js`.
- **NO score change in Phase A.** Rules stay `status: "experimental"`, `contributesToScore: false`; catalogue numbers move null→measured (still off-score). `scoring-contract.test.ts` + `scoringVersion` UNCHANGED.
- Catalogue-coherence keystone: every number = `deriveMeasurement(adapter matrix)`; no hand-pasted constants.
- A rule that can't be made bounded (semantic FP not deterministically removable) is recorded `not-promotion-ready → Solution 2`, not forced.
- Conventional Commits; branch `feat/color-to-90`. Trailers (blank line before):
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`

## Targets

`stories/props-documented` (Task 1-3 proof), then `stories/usage-examples`, `ai-surface/component-manifest-completeness` (Task 4). `tokens/no-hardcoded-gradient` is actually a DETECTION rule (hardcoded gradient = judgment) → moved to Solution 2, not here.

---

## Task 1: tighten `stories/props-documented` (remove the prop-less-component FP)

**Files:**
- Modify: `packages/core/src/rules/stories-props-documented.ts`
- Test: `packages/core/tests/rules/stories-props-documented.test.ts`

**Interfaces:**
- Consumes: `ComponentInventoryEntry.props` (`ComponentPropEntry[]` — present when the loader parsed the component source). `ctx.componentInventory` entry `c` carries `c.props`.

- [ ] **Step 1: Write the failing test**

Add cases: a component WITH props (`c.props` non-empty) whose story has no argTypes/args → STILL flagged (real deficiency); a PROP-LESS component (`c.props` empty/undefined) whose story has no argTypes/args → NOT flagged (no props to document); a component with props whose story has argTypes → not flagged (existing). Mirror the existing test's `ctxWith` harness; set `componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5, props: [{ name: "variant" }] }]` vs a prop-less `{ name: "Divider", …, props: [] }` (and one with `props` undefined).

```typescript
it("does NOT flag a prop-less component (no props to document)", async () => {
  const ctx = ctxWith(new Map([["Divider", { id: "d", importPath: "x", hasArgTypes: false, stories: [{ name: "Default" }] }]]),
    { componentInventory: [{ name: "Divider", module: "@acme/ui", usageCount: 2, props: [] }] });
  const res = await rule.evaluate(ctx, EMPTY);
  expect(res.findings).toHaveLength(0);
});
it("flags a component WITH props whose story documents none", async () => {
  const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, stories: [{ name: "Primary" }] }]]),
    { componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5, props: [{ name: "variant" }] }] });
  const res = await rule.evaluate(ctx, EMPTY);
  expect(res.findings).toHaveLength(1);
});
it("does NOT flag when the component's props are unknown (not parsed)", async () => {
  const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, stories: [{ name: "Primary" }] }]]),
    { componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5 }] }); // props undefined
  const res = await rule.evaluate(ctx, EMPTY);
  expect(res.findings).toHaveLength(0); // can't prove a deficiency without knowing props → don't flag
});
```

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/rules/stories-props-documented.test.ts`).

- [ ] **Step 3: Implement the tightening**

In the `evaluate` loop, before pushing a finding, require the component to HAVE known props: `const props = c.props ?? []; if (props.length === 0) continue;` (skip prop-less AND unknown-props components — only flag a genuine deficiency: has props, story documents none). Update `opportunities` to count only components that have a story AND known non-empty props (the judged denominator). Update the rule's `fullDescription`/`rationale` to state it fires only when the component has props but the story documents none.

- [ ] **Step 4: Run → pass** (all cases incl. the existing ones; update any existing test that assumed prop-less flagging).

- [ ] **Step 5: Commit** (`fix(stories): props-documented fires only when the component has props (no prop-less FP)`).

---

## Task 2: harden `props-documented` adversarial validator + measure (off-score)

**Files:**
- Modify: `validation/adapters/component-adapters.ts` (the `props-documented` adapter)
- Modify: `src/reliability/catalogue/sub-axes.ts`, `rules-manifest.json`

- [ ] **Step 1: Enumerate FP classes (now bounded after tightening)**

FP classes that must NOT flag: a component with props whose story has `argTypes`; with a named export carrying `args`; a PROP-LESS component with a bare story; a component with UNKNOWN props (not parsed); a component with no story (not counted); `dsSelfMode`; `storyIndex` null. Write them in the report.

- [ ] **Step 2: Harden the adapter**

Expand the `props-documented` adapter to ≥35 distinct POSITIVE fixtures (components WITH props — varied prop shapes — whose stories document none: bare `export const X = {}`, no argTypes) so J=1 yields precision AND recall Wilson LB ≥ 0.90. Add `falseFriends` covering every FP class from Step 1 (incl. prop-less-with-bare-story and unknown-props — the tightening's new exclusions). Each falseFriend = a case the tightened rule correctly does NOT flag. (The adapter fixtures need component source files so `buildComponentInventory` extracts `props` — mirror the existing consumer-app fixture pattern in this file, ensuring the components have real prop type definitions.)

- [ ] **Step 3: Engine + catalogue sync**

`cd packages/core && pnpm validate:autonomous`. Update the `stories.props-documented` sub-axes entry to the `deriveMeasurement` numbers (precision/recall/both Wilson LBs/nSamples, `lastCalibrated: "2026-06-28T00:00:00.000Z"`). KEEP `experimental` + `contributesToScore: false`. Regenerate `rules-manifest.json`. `pnpm vitest run` → coherence + parity green, scoring-contract UNCHANGED. GATE 1: if J<1, fix the rule or record the genuine limitation (don't delete a hard falseFriend).

- [ ] **Step 4: Commit** (`feat(measure): harden props-documented adversarial validator + measure (off-score)`).

---

## Task 3: deterministic corpus confirmation for `props-documented`

**Files:**
- Modify: `packages/core/src/reliability/measure/auto-label.ts` (+ test) — add a row-aware verifier.

**Interfaces:**
- The current `auto-label.ts` verifiers are repo-level (`(repoDir) => boolean`). `props-documented` is per-finding → the verifier needs the finding. Extend the verifier mechanism minimally to support a row-aware verifier: `(row: FindingRow, repoDir: string) => boolean` for rules that need it, keeping the existing repo-level verifiers working.

- [ ] **Step 1: Write the failing test**

A `props-documented` finding on a component that genuinely has props + an under-documented story → `tp`; a finding whose component+story actually documents props (rule mis-fired) → `fp`. Build temp repos with a component (real prop types) + a story; assert.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement the verifier**

Add a `props-documented` verifier that INDEPENDENTLY re-derives the verdict: from the finding (component name in `row` / message), re-parse the component to confirm it has props AND re-parse its story to confirm no argTypes/args → genuine deficiency → `tp`; if props are documented or the component is prop-less → `fp`. Wire it into the verifier table with the row-aware signature. Keep the repo-level verifiers + the `needs-verifier` default unchanged.

- [ ] **Step 4: Run → pass** (+ existing auto-label tests green).

- [ ] **Step 5: Corpus confirmation**

`npx tsx scripts/measure-one-rule.ts .bench-corpus stories/props-documented` — BUT route structural rules through the deterministic verifier, not the LLM judge (if `measure-one-rule.ts` only does LLM judging, add a `--structural` path that auto-labels via the verifier; OR run `scripts/measure-rules.ts` which already routes structural→autoLabel). Read the corpus precision Wilson LB. CONFIRM ≥ 0.90 and no FP class the validator lacked. (Harvest of 19 repos takes minutes; if it runs long, note partial coverage.)

- [ ] **Step 6: Verdict + commit**

Record the verdict (`promotion-ready` iff syntheticPrecLB ≥ 0.90 ∧ syntheticRecallLB ≥ 0.90 ∧ corpusPrecLB ≥ 0.90 ∧ enumeration complete). This is the POSITIVE proof the model can promote a (tightened) structural rule. Commit (`feat(measure): props-documented deterministic corpus confirmation + verdict`). If it FAILS, STOP and escalate (the structural path also needs revision).

---

## Task 4: scale to the remaining structural rules

Apply Tasks 1-3's recipe (tighten → harden → deterministic corpus-confirm → verdict) to each, one per sub-task:

- [ ] **`stories/usage-examples`** — tighten: only require multiple examples for components with ≥1 variant prop (or ≥N props) from inventory; prop-less/trivial components excluded. Then harden + verify.
- [ ] **`ai-surface/component-manifest-completeness`** — tighten: require a field (e.g. `examples`) only when applicable; expand positives from N=3 to ≥35; add row-aware verifier. Then harden + verify.

Each: record `promotion-ready` / `not-promotion-ready (→ Solution 2)` with the reason. Output the verdicts into `docs/superpowers/promotion-readiness-report.{md,json}`.

---

## Self-Review

**1. Spec coverage:** tighten-then-bound (step 0) → Task 1 + Task 4 per rule. Harden validator ≥35 + falseFriends → Task 2 / Task 4. Deterministic (non-LLM) corpus confirmation → Task 3 / Task 4. No score change / off-score → Global Constraints + every catalogue-sync. promotion-ready gate (all 4 sub-gates) → Task 3 Step 6. gradient excluded as detection → Targets. ✓

**2. Placeholder scan:** FP-class lists are concrete; "≥35" exact; the row-aware verifier extension is specified. The "tighten usage-examples using ≥1 variant prop" is a concrete deterministic signal from inventory. No TBD.

**3. Type consistency:** `ComponentInventoryEntry.props` (`ComponentPropEntry[]`) used in Task 1 + the Task 3 verifier. `FindingRow` row-aware verifier signature `(row, repoDir) => boolean`. Catalogue `SubAxisRecord` numbers from `deriveMeasurement`.

## Risks

- **Corpus run cost** (Task 3 Step 5): harvest of 19 repos is minutes. Structural auto-label is cheap (no LLM). Acceptable.
- **A tightened rule still has a hidden semantic FP** the corpus surfaces → record `not-promotion-ready → Solution 2` (the guard working again). props-documented is the proof; if even the tightened structural rule fails the corpus gate, escalate — it would mean the deterministic-promotion well is dry and Solution 2 is the path for everything.
- **Inventory prop-extraction reliability**: the tightening depends on `c.props` being populated; on real components the loader may fail to parse some prop types → those become unknown-props → not flagged (conservative, correct). The corpus confirmation checks this holds.
- Phase B (the score flip) is NOT in this plan — post-merge, the v2→v3 bump with D.
