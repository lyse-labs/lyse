# Sub-project B1 Implementation Plan — manifest-completeness + no-arbitrary-tailwind

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new socle rules — `ai-surface/component-manifest-completeness` (manifest entries declare props/variants/examples) and `components/no-arbitrary-tailwind` (non-color arbitrary Tailwind values) — born experimental/off-score, fully registered, honestly catalogued.

**Architecture:** Two independent new rules. Each = a rule file via `createLyseRule` + registry import + a `sub-axes.ts` catalogue entry (parity test requires it) + a coverage classification (completeness gate requires it) + regenerated `rules-manifest.json` (tracked artifact) + tests. No score change (both experimental). Boundaries: completeness ≠ manifest-json (existence); no-arbitrary-tailwind ≠ color (value-type split).

**Tech Stack:** TypeScript (strict), vitest, `createLyseRule`, fast-glob (manifest discovery), the reliability catalogue + coverage + parity gates, the validation engine (status-aware J gate).

## Global Constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax); ESM `.js`.
- Determinism byte-for-byte; no Date.now()/Math.random(); fixed `lastCalibrated` strings.
- Both rules born `status: "experimental"`, `contributesToScore: false`. NO score change in B1.
- HONEST catalogue values: `component-manifest-completeness` is deterministic/structural (precision 1.0 legit) but Tier-B; `no-arbitrary-tailwind` starts unmeasured (precision/recall `null`, nSamples 0) — do NOT paste a synthetic 1.0 (the color/sub-A lesson). Real precision comes from a later harvest measurement.
- No overfit: general signals only (no sample-repo names in active code). No LLM in the score.
- Rule metadata in the rule file via `createLyseRule`; NEVER edit `manifest.ts`. Regenerate `rules-manifest.json` via the build/generator; add a `sub-axes.ts` entry + a coverage classification for each new rule (parity + completeness gates).
- Boundary (zero overlap): completeness only speaks when a manifest exists (manifest-json owns absence); no-arbitrary-tailwind flags only NON-color brackets (color owns `[#hex]`/color-fn brackets).
- Conventional Commits; branch `feat/color-to-90` (stacked). Trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`. English.

## File Structure

- `packages/core/src/rules/ai-surface-component-manifest-completeness.ts` — new rule.
- `packages/core/src/rules/components-no-arbitrary-tailwind.ts` — new rule.
- `packages/core/src/rules/registry.ts` — import + register both.
- `packages/core/src/reliability/catalogue/sub-axes.ts` — one entry per rule.
- the coverage classification file (find it: `src/reliability/.../coverage*.ts` — the completeness gate) — classify both.
- `packages/core/rules-manifest.json` — regenerate (tracked artifact).
- `packages/core/validation/adapters/*` — construction-oracle adapter per rule (or addressable-pending classification if not injectable).
- Tests: `packages/core/tests/rules/{ai-surface-component-manifest-completeness,components-no-arbitrary-tailwind}.test.ts`.

---

## Task 1: `ai-surface/component-manifest-completeness`

**Files:**
- Create: `packages/core/src/rules/ai-surface-component-manifest-completeness.ts`
- Modify: `packages/core/src/rules/registry.ts`, `packages/core/src/reliability/catalogue/sub-axes.ts`, the coverage classification file, `packages/core/rules-manifest.json`
- Create: `packages/core/tests/rules/ai-surface-component-manifest-completeness.test.ts`, a validation adapter (or coverage-pending classification)

**Interfaces:**
- Consumes: the manifest-discovery approach from `ai-surface-component-manifest-json.ts` (`CANDIDATE_PATTERNS` + fast-glob, `isPathExcluded`); `createLyseRule`; `RuleContext`/`ParsedFiles`/`Finding` from `src/types.ts`.
- Produces: rule `tokens... ` no — `lyseRuleId: "ai-surface/component-manifest-completeness"`, axis `ai-surface`, severity `info`. Flags each manifest component entry missing `props` (non-empty) / `variants` (when present-but-empty) / `examples` (≥1). `opportunities` = number of entries inspected. Silent when no manifest.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/ai-surface-component-manifest-completeness.test.ts
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/ai-surface-component-manifest-completeness.js";
import { makeRuleContext, makeParsedFiles } from "../_helpers/rule-harness.js"; // use the repo's existing rule-test helper; if none, build ParsedFiles inline like other rule tests

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

function run(files: Record<string, string>) {
  const parsed = makeParsedFiles(files);            // adapt to the repo's helper signature
  return rule.create().evaluate(makeRuleContext(), parsed);
}

describe("ai-surface/component-manifest-completeness", () => {
  it("flags a component entry missing props", async () => {
    const manifest = JSON.stringify({ components: [{ name: "Button", sourceFile: "Button.tsx" }] });
    const res = await run({ "package.json": PKG, "components.json": manifest });
    expect(res.findings.some((f) => f.message.includes("Button") && /props/i.test(f.message))).toBe(true);
  });

  it("does not flag a complete entry", async () => {
    const manifest = JSON.stringify({ components: [{ name: "Button", sourceFile: "Button.tsx", props: [{ name: "variant" }], variants: ["primary"], examples: ["<Button/>"] }] });
    const res = await run({ "package.json": PKG, "components.json": manifest });
    expect(res.findings).toHaveLength(0);
  });

  it("is silent when no manifest exists (manifest-json owns absence)", async () => {
    const res = await run({ "package.json": PKG, "src/Button.tsx": "export const Button = () => null;" });
    expect(res.findings).toHaveLength(0);
    expect(res.opportunities).toBe(0);
  });
});
```

(Adapt `makeRuleContext`/`makeParsedFiles` to the repo's actual rule-test harness — read an existing `tests/rules/*.test.ts` for the exact helper or inline-ParsedFiles pattern.)

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/rules/ai-surface-component-manifest-completeness.test.ts`) — module not found.

- [ ] **Step 3: Implement the rule**

Create the rule via `createLyseRule`. Discover the manifest with the SAME approach as `ai-surface-component-manifest-json.ts` (reuse `CANDIDATE_PATTERNS` — export it from that module or replicate, plus `isPathExcluded`). If no manifest file → return `{ findings: [], opportunities: 0 }`. Else parse JSON; for the `components` array/object, for each entry: if `props` is absent or an empty array → finding "Component \"<name>\" manifest entry is missing documented `props`"; if `variants` is present but empty → finding; if `examples` absent/empty → finding. `opportunities` = entries inspected. meta: axis `ai-surface`, severity `info`, the full `createLyseRule` meta block (shortDescription/fullDescription/helpUri/rationale/examples/allowlist) per the codebase convention. `deterministicValidator`-style (no LLM).

- [ ] **Step 4: Register + catalogue + coverage + manifest**

- `registry.ts`: import the rule, add to `ruleObjects`.
- `sub-axes.ts`: add an entry `{ id: "ai-surface.component-manifest-completeness", axis: "ai-surface", name: "Component manifest completeness", status: "experimental", precisionMeasured: 1, recallMeasured: 1, precisionWilsonLowerBound: <wilsonLowerBound from its fixture N>, recallWilsonLowerBound: ..., nSamples: <real fixture count>, lastCalibrated: "2026-06-28T00:00:00.000Z", contributesToScore: false, ruleIds: ["ai-surface/component-manifest-completeness"], llmDriven: false, deterministicValidator: true }`. (Deterministic structural check → 1.0 legit; N from the test fixtures; experimental/off-score.)
- coverage classification file: classify the new rule (covered-by-adapter or addressable-pending — match how sibling presence rules are classified).
- Regenerate `rules-manifest.json` (run the manifest generator script — find it in package.json scripts, e.g. `pnpm --filter ... build:manifest` or the build).

- [ ] **Step 5: Adapter for the engine + green**

Add a construction-oracle adapter (clean manifest = no flag; a mutation that removes `props` from an entry = flags) via the presence/factory pattern in `validation/`, OR classify as addressable-pending if not cleanly injectable. Run `cd packages/core && pnpm vitest run` (parity test 66=66, coverage uncovered=[], rule tests green). Run `pnpm validate:autonomous` → ENGINE GATE PASS (experimental → not J-gated, but the adapter should still be J=1 on its construction oracle if added).

- [ ] **Step 6: Docs + commit**

Generate the rule doc stub if the repo convention requires (`docs/rules/...`), regenerate sub-axes/coverage docs (`pnpm tsx scripts/render-coverage.ts`). Commit:

```bash
git add packages/core/src/rules/ai-surface-component-manifest-completeness.ts packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts <coverage file> packages/core/rules-manifest.json packages/core/validation packages/core/tests/rules/ai-surface-component-manifest-completeness.test.ts docs/
git commit -m "feat(ai-surface): component-manifest-completeness rule (props/variants/examples)"
```

---

## Task 2: `components/no-arbitrary-tailwind`

**Files:**
- Create: `packages/core/src/rules/components-no-arbitrary-tailwind.ts`
- Modify: `registry.ts`, `sub-axes.ts`, coverage file, `rules-manifest.json`
- Create: test + validation adapter

**Interfaces:**
- Consumes: `createLyseRule`, `ParsedFiles` (the `ts`/`cssInJs` parsed files carrying `className` text), `_skip-context`/`_exclude` for FP suppression. The color rule's `TW_ARBITRARY` regex (`/\b(bg|text|border|fill|stroke|ring|shadow|from|to|via|outline|caret|accent|decoration|divide|placeholder)-\[#[0-9a-fA-F]{3,8}\]/g`) defines what COLOR owns — this rule owns the COMPLEMENT.
- Produces: `lyseRuleId: "components/no-arbitrary-tailwind"`, axis `components`, severity `warning`. Flags `<prefix>-[<value>]` in className strings where `<value>` is NOT a color. `opportunities` = arbitrary-value candidates inspected.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/components-no-arbitrary-tailwind.test.ts
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-no-arbitrary-tailwind.js";
import { makeRuleContext, makeParsedFiles } from "../_helpers/rule-harness.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const run = (files: Record<string, string>) => rule.create().evaluate(makeRuleContext(), makeParsedFiles(files));

describe("components/no-arbitrary-tailwind", () => {
  it("flags a non-color arbitrary spacing value", async () => {
    const res = await run({ "package.json": PKG, "B.tsx": 'export const B = () => <div className="p-[12px]" />;' });
    expect(res.findings.some((f) => f.message.includes("p-[12px]"))).toBe(true);
  });
  it("flags arbitrary text size (text-[14px]) but NOT arbitrary color (text-[#111])", async () => {
    const size = await run({ "package.json": PKG, "B.tsx": 'export const B = () => <div className="text-[14px]" />;' });
    expect(size.findings.length).toBeGreaterThan(0);
    const color = await run({ "package.json": PKG, "B.tsx": 'export const B = () => <div className="text-[#111]" />;' });
    expect(color.findings, "color brackets belong to tokens/no-hardcoded-color, not this rule").toHaveLength(0);
  });
  it("does NOT flag scale utilities (p-4, text-sm)", async () => {
    const res = await run({ "package.json": PKG, "B.tsx": 'export const B = () => <div className="p-4 text-sm rounded-md" />;' });
    expect(res.findings).toHaveLength(0);
  });
  it("does NOT flag var() token references in brackets (w-[var(--x)])", async () => {
    const res = await run({ "package.json": PKG, "B.tsx": 'export const B = () => <div className="w-[var(--sidebar)]" />;' });
    expect(res.findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → fail** (module not found).

- [ ] **Step 3: Implement the rule**

`createLyseRule`. Scan `className` string literals in the parsed `ts`/`cssInJs` files (mirror how the color rule reaches className text). Match arbitrary utilities `\b[a-z][a-z-]*-\[([^\]]+)\]`. For each match, classify the bracket value `<value>`:
- color (`#hex`, `rgb(`/`rgba(`/`hsl(`/`hsla(`/`oklch(`/`oklab(`/`lab(`/`lch(`, or a named CSS color) → SKIP (color rule owns it).
- `var(` reference or a token-ish reference → SKIP (token use).
- otherwise (a literal `12px`/`14px`/`37px`/`1fr`/`0.5rem`/etc.) → finding "Arbitrary Tailwind value `<prefix>-[<value>]` bypasses the scale".
Apply `_skip-context`/`isPathExcluded` (token-def/story/test/vendored/generated). `opportunities` = candidates inspected. meta block per convention, axis `components`, severity `warning`.

- [ ] **Step 4: Register + catalogue + coverage + manifest**

- `registry.ts`: import + add to `ruleObjects`.
- `sub-axes.ts`: entry `{ id: "components.no-arbitrary-tailwind", axis: "components", name: "No arbitrary Tailwind values (non-color)", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, nSamples: 0, lastCalibrated: null, contributesToScore: false, ruleIds: ["components/no-arbitrary-tailwind"], llmDriven: false }`. (Real detector → starts UNMEASURED/null; honest — real precision is a later harvest step, NOT a pasted synthetic 1.0.)
- coverage classification: classify the new rule.
- Regenerate `rules-manifest.json`.

- [ ] **Step 5: Adapter + green**

Construction-oracle adapter: clean fixture (`className="p-4"`) = no flag; mutations (`p-[12px]`, `text-[14px]`, `w-[37px]`) = flag; metamorphic / false-friend (`text-[#111]` must NOT flag — it's color's; `p-4` must not). Run `cd packages/core && pnpm vitest run` (parity 67=67, coverage uncovered=[], tests green); `pnpm validate:autonomous` → ENGINE GATE PASS (experimental → not J-gated; adapter J=1 on its oracle).

- [ ] **Step 6: Docs + commit**

Regenerate docs. Commit:

```bash
git add packages/core/src/rules/components-no-arbitrary-tailwind.ts packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts <coverage file> packages/core/rules-manifest.json packages/core/validation packages/core/tests/rules/components-no-arbitrary-tailwind.test.ts docs/
git commit -m "feat(components): no-arbitrary-tailwind rule (non-color arbitrary values bypass the scale)"
```

---

## Task 3: CHANGELOG + changeset

**Files:** `CHANGELOG.md`, `.changeset/<name>.md`

- [ ] **Step 1:** CHANGELOG `[Unreleased] / Added`: the two new socle rules (experimental, off-score). Note no-arbitrary-tailwind awaits real-code precision measurement; manifest-completeness is a deterministic structural check.
- [ ] **Step 2:** `.changeset/socle-b1.md` (`minor`, alpha convention) describing the two new experimental rules. No score change.
- [ ] **Step 3:** Commit `docs(changeset): sub-project B1 socle rules`.

---

## Self-Review

**1. Spec coverage:**
- component-manifest-completeness (props/variants/examples, Tier-B, distinct from manifest-json) → Task 1. ✓
- no-arbitrary-tailwind (non-color arbitrary, value-type split vs color, scale/var exempt) → Task 2. ✓
- Both experimental/off-score, honest catalogue (completeness 1.0 deterministic; tailwind null/unmeasured) → Tasks 1/2 Step 4. ✓
- Parity + coverage + manifest regen per new rule → Steps 4/5. ✓
- No score change → Global Constraints + both entries contributesToScore false. ✓

**2. Placeholder scan:** The test helper (`makeRuleContext`/`makeParsedFiles`) is "adapt to the repo's actual harness" — that's a real instruction to read an existing rule test (the harness exists; the implementer matches it), not a placeholder; the assertions are concrete. The manifest-discovery reuse and the color `TW_ARBITRARY` complement are named with the exact existing regex. The Wilson LB / N for completeness = "from its fixture count" (computed via the existing `wilsonLowerBound`, deterministic) — concrete. All commands runnable.

**3. Type consistency:** `lyseRuleId` strings match the sub-axes `ruleIds` + catalogue `id`. `createLyseRule` meta shape per the contract. The value-type classification (color vs non-color vs var) is consistent between Task 2's rule + adapter + tests.

## Risks

- no-arbitrary-tailwind real precision unknown until the harvest measurement (honest: starts null/experimental).
- Tailwind value-type edge cases (`grid-cols-[1fr_2fr]`, `min-w-[20ch]`) → flag conservatively as non-color arbitrary (they DO bypass the scale); tune on the harvest.
- Coverage/parity gates: each new rule MUST get a sub-axis entry + coverage classification + regenerated manifest, or the parity/completeness tests fail — Steps 4 handle this explicitly.
