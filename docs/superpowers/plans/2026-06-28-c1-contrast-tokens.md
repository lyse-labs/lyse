# C1 — a11y/contrast-tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `a11y/contrast-tokens` — a static WCAG-AA contrast check on co-applied foreground/background pairs (a CSS rule / style declaring both `color` and a background), born experimental/off-score.

**Architecture:** A pure WCAG contrast util (color-parse + relative luminance + ratio) + the rule that extracts co-applied fg/bg pairs from CSS / CSS-in-JS / inline styles, resolves each side to a concrete color (literal, or `var(--token)` → forward DTCG canonical map), and flags pairs below threshold. Skip-on-unresolvable (recall-safe).

**Tech Stack:** TypeScript (strict), vitest, the CSS/CSS-in-JS parsers (`ParsedFiles.css`/`cssInJs`), the forward DTCG canonical token map (`src/render/dtcg-canonical-map.ts` + `cssVarToTokenPath`), `createLyseRule`, the reliability catalogue + gates, the validation engine.

## Global Constraints

- Strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax); ESM `.js`.
- Determinism byte-for-byte; no Date.now()/Math.random(); `lastCalibrated: null` (unmeasured).
- Born `status: "experimental"`, `contributesToScore: false`. No score change. HONEST catalogue: all metrics `null`, `nSamples: 0` — real detector, real precision is a later harvest (NO synthetic number).
- Recall-safety: flag ONLY when BOTH sides resolve to opaque concrete colors; ANY unresolvable / alpha<1 / `transparent` / `currentColor` / `inherit` / gradient / `url()` → SKIP (never guess a contrast verdict). Same-rule co-applied pairs only (v1). Skip token-def/story/test/vendored (`_skip-context`/`_exclude`).
- Thresholds: WCAG AA — 4.5:1 normal text; 3.0:1 large text (font-size ≥ 24px, or ≥ 18.66px with font-weight ≥ 700, in the same rule).
- Zero overlap: orthogonal to `tokens/no-hardcoded-color` (value) and `a11y/runtime-axe` (render-only).
- No LLM in the score. No overfit. Rule via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes entry + coverage classification (parity + completeness gates).
- Conventional Commits; branch `feat/color-to-90`. Trailers: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`. English.

## File Structure

- `packages/core/src/a11y/contrast.ts` — new pure WCAG util.
- `packages/core/src/rules/a11y-contrast-tokens.ts` — new rule.
- `registry.ts`, `sub-axes.ts`, coverage file, `rules-manifest.json` — register.
- Tests + validation adapter + docs stub.

---

## Task 1: WCAG contrast util (pure)

**Files:**
- Create: `packages/core/src/a11y/contrast.ts`
- Test: `packages/core/tests/a11y/contrast.test.ts`

**Interfaces:**
- Produces:
  - `parseColor(s: string): { r: number; g: number; b: number; a: number } | null` (0–255 channels, a 0–1; null if unparseable). Handles `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`, `rgb()/rgba()`, `hsl()/hsla()`, and a named-color subset (`white`/`black`/`red`/… — a small static map; unknown name → null).
  - `relativeLuminance(c: { r: number; g: number; b: number }): number` (WCAG 2.x sRGB).
  - `contrastRatio(fg: string, bg: string): number | null` — parse both; if either null OR either alpha < 1 → `null`; else `(max(Lf,Lb)+0.05)/(min(Lf,Lb)+0.05)`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/a11y/contrast.test.ts
import { describe, it, expect } from "vitest";
import { contrastRatio, relativeLuminance, parseColor } from "../../src/a11y/contrast.js";

describe("WCAG contrast util", () => {
  it("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
  it("white on white is 1:1", () => {
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
  });
  it("#767676 on white passes AA (~4.54)", () => {
    expect(contrastRatio("#767676", "#ffffff")!).toBeGreaterThanOrEqual(4.5);
  });
  it("#777777 on white fails AA (<4.5)", () => {
    expect(contrastRatio("#999999", "#ffffff")!).toBeLessThan(4.5);
  });
  it("returns null when a side has alpha < 1", () => {
    expect(contrastRatio("rgba(0,0,0,0.5)", "#fff")).toBeNull();
  });
  it("returns null for an unparseable color", () => {
    expect(contrastRatio("var(--x)", "#fff")).toBeNull();
    expect(parseColor("notacolor")).toBeNull();
  });
  it("relativeLuminance: white=1, black=0", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Run → fail** (`cd packages/core && pnpm vitest run tests/a11y/contrast.test.ts`) — module not found.

- [ ] **Step 3: Implement `contrast.ts`**

`parseColor`: handle hex (3/4/6/8 digit — 4/8 carry alpha), `rgb()/rgba()`, `hsl()/hsla()` (convert HSL→RGB), and a static named-color map (`{ white:[255,255,255], black:[0,0,0], red:[255,0,0], … }` — include the common ones); return null otherwise. `relativeLuminance`: per WCAG, linearize each channel `c/255`; `cs = c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4`; `L = 0.2126*r + 0.7152*g + 0.0722*b`. `contrastRatio`: parse both; null if either null or `a < 1`; `L1=lum(fg), L2=lum(bg); ratio=(max+0.05)/(min+0.05)`. Pure, deterministic.

- [ ] **Step 4: Green** (`pnpm vitest run tests/a11y/contrast.test.ts` → all pass).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/a11y/contrast.ts packages/core/tests/a11y/contrast.test.ts
git commit -m "feat(a11y): pure WCAG contrast util (parseColor, relativeLuminance, contrastRatio)"
```

---

## Task 2: `a11y/contrast-tokens` rule

**Files:**
- Create: `packages/core/src/rules/a11y-contrast-tokens.ts`
- Modify: `registry.ts`, `sub-axes.ts`, coverage file, `rules-manifest.json`
- Create: test + validation adapter + `docs/rules/a11y-contrast-tokens.md`

**Interfaces:**
- Consumes: `contrastRatio` (Task 1); `ParsedFiles.css` (`ParsedCssFile` — read its shape: rules with selector + declarations) + `ParsedFiles.cssInJs` + inline `style` (mirror how an existing CSS-consuming rule reads declarations, e.g. `tokens-no-hardcoded-color.ts`); the forward token resolution (`src/render/dtcg-canonical-map.ts` + `cssVarToTokenPath`) and/or `ctx.tokens`. RuleContext.
- Produces: `lyseRuleId: "a11y/contrast-tokens"`, axis `a11y`, severity `warning`. Flags co-applied fg/bg pairs below threshold. opportunities = resolvable co-applied pairs inspected.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rules/a11y-contrast-tokens.test.ts
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/a11y-contrast-tokens.js";
import { makeRuleContext, makeParsedFiles } from "../_helpers/rule-harness.js"; // adapt to the real harness

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });
const run = (files: Record<string,string>, ctx = {}) => rule.create().evaluate(makeRuleContext(ctx), makeParsedFiles(files));

describe("a11y/contrast-tokens", () => {
  it("flags a co-applied low-contrast literal pair", async () => {
    const res = await run({ "package.json": PKG, "a.css": ".x { color: #999999; background: #ffffff; }" });
    expect(res.findings.length).toBeGreaterThan(0);
  });
  it("does NOT flag a passing pair", async () => {
    const res = await run({ "package.json": PKG, "a.css": ".x { color: #111111; background: #ffffff; }" });
    expect(res.findings).toHaveLength(0);
  });
  it("does NOT flag when only one of color/background is present", async () => {
    const res = await run({ "package.json": PKG, "a.css": ".x { color: #999999; }" });
    expect(res.findings).toHaveLength(0);
  });
  it("skips when a side is unresolvable / alpha / transparent / gradient", async () => {
    const v = await run({ "package.json": PKG, "a.css": ".x { color: #999; background: var(--unknown); }" });
    expect(v.findings).toHaveLength(0);
    const al = await run({ "package.json": PKG, "a.css": ".x { color: rgba(0,0,0,0.4); background: #fff; }" });
    expect(al.findings).toHaveLength(0);
    const gr = await run({ "package.json": PKG, "a.css": ".x { color: #999; background: linear-gradient(#fff,#000); }" });
    expect(gr.findings).toHaveLength(0);
  });
  it("uses 3:1 for large text", async () => {
    // #949494 on #fff ≈ 3.1 : fails AA-normal(4.5) but passes large(3.0)
    const res = await run({ "package.json": PKG, "a.css": ".x { color: #949494; background: #fff; font-size: 28px; }" });
    expect(res.findings, "large text uses the 3:1 threshold").toHaveLength(0);
  });
});
```

(Adapt `makeRuleContext`/`makeParsedFiles` to the real harness; compute the exact `#949494`-style boundary value with the Task-1 util so the large-text case is a true 3.0–4.5 middle.)

- [ ] **Step 2: Run → fail** (module not found).

- [ ] **Step 3: Implement the rule**

`createLyseRule`. For each `ParsedFiles.css` rule (and `cssInJs` block, and inline `style` objects in `ts`): collect the rule/block's declarations; find a foreground (`color`) and a background (`background-color`, or a solid `background`); for each, RESOLVE the value: if a `var(--t)` → `cssVarToTokenPath` → forward canonical map value (or `ctx.tokens`); if a literal → use it; else unresolvable. If BOTH resolve, call `contrastRatio(fg, bg)`; if it returns a number (both opaque/parseable) → determine the threshold (4.5, or 3.0 if the same rule has `font-size` ≥ 24px or ≥ 18.66px+weight≥700) → if `ratio < threshold`, emit finding "Contrast `<ratio.toFixed(2)>` for `<fg>` on `<bg>` is below WCAG AA `<threshold>`:1". Skip when `contrastRatio` is null (alpha/unparseable), gradient/url backgrounds, `transparent`/`currentColor`/`inherit`, and excluded paths. opportunities = resolvable co-applied pairs. axis `a11y`, severity `warning`.

- [ ] **Step 4: Register + catalogue + coverage + manifest**

- `registry.ts`: import + ruleObjects.
- `sub-axes.ts`: `id: "a11y.contrast-tokens"`, axis a11y, status experimental, contributesToScore false, **all metrics null, nSamples 0, lastCalibrated null**, ruleIds `["a11y/contrast-tokens"]`, llmDriven false.
- coverage classification (warning detector → covered-by-adapter).
- Regenerate `rules-manifest.json`.

- [ ] **Step 5: Adapter + green**

Construction-oracle adapter: clean = `.x{color:#111;background:#fff}` (no flag); mutations = `.x{color:#999;background:#fff}` (flag), inline-style low-contrast (flag); false-friends = passing pair, single-property rule, alpha/gradient/unresolvable (no flag). Aim J=1. Run `cd packages/core && pnpm vitest run` (parity new count, uncovered=[], green); `pnpm validate:autonomous` → ENGINE GATE PASS.

- [ ] **Step 6: Docs + commit**

Create `docs/rules/a11y-contrast-tokens.md` (helpUri target); regenerate docs. Commit:

```bash
git add packages/core/src/rules/a11y-contrast-tokens.ts packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts <coverage> packages/core/rules-manifest.json packages/core/validation packages/core/tests/rules/a11y-contrast-tokens.test.ts docs/
git commit -m "feat(a11y): contrast-tokens rule (static WCAG-AA on co-applied fg/bg pairs)"
```

---

## Task 3: CHANGELOG + changeset

- [ ] **Step 1:** CHANGELOG `[Unreleased] / Added`: the new socle rule (experimental, off-score; static WCAG-AA contrast on co-applied fg/bg token pairs — the previously-missing static contrast capability; real-world precision pending harvest).
- [ ] **Step 2:** `.changeset/socle-c1.md` (`minor`). No score change.
- [ ] **Step 3:** Commit `docs(changeset): C1 a11y/contrast-tokens`.

---

## Self-Review

**1. Spec coverage:**
- Co-applied fg/bg pair detection → Task 2. ✓
- Token resolution (var→canonical map / literal; skip unresolvable) → Task 2 Step 3. ✓
- WCAG util (luminance + ratio, null on alpha/unparseable) → Task 1. ✓
- Thresholds AA 4.5 / large 3.0 → Task 2 Step 3 + test. ✓
- Anti-FP (alpha/transparent/gradient/unresolvable/single-prop/excluded skip) → Task 2 Step 3 + tests. ✓
- Honest unmeasured catalogue → Task 2 Step 4. ✓
- Boundaries (orthogonal to color/runtime-axe) → spec; the rule checks ratio not value, static not render. ✓

**2. Placeholder scan:** The test harness (`makeRuleContext`/`makeParsedFiles`) + "read ParsedCssFile shape / mirror an existing CSS rule" are concrete instructions against existing code, not placeholders; the WCAG formulas + thresholds + assertions are exact. The large-text boundary value is "compute with the Task-1 util" — a concrete derivation. All commands runnable.

**3. Type consistency:** `contrastRatio(fg, bg): number | null` consistent across Task 1 (def) + Task 2 (use). `parseColor`/`relativeLuminance` signatures fixed in Task 1. Threshold constants (4.5/3.0) consistent. sub-axes `id`/`ruleIds` match `a11y/contrast-tokens`.

## Risks

- Token resolution coverage (no DTCG → many skips, low coverage, no FPs — recall-safe).
- Same-rule-only misses cross-rule/inherited backgrounds (v1 scope, documented).
- 90% empirical → measured on real code; honest experimental fallback (color lesson).
- CSS `background` shorthand parsing (color vs gradient/image/position) — detect a solid color only; anything else → skip.
