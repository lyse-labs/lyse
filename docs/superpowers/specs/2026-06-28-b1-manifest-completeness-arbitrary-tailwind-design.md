# Sub-project B1 — manifest-completeness + no-arbitrary-tailwind — Design

> First wave of sub-project B (components-reuse layer of the expert "socle
> impératif"). B1 = the two CLEAN, MECHANICAL socle rules with no dependency on
> the component inventory. `components/no-style-escape-hatch` and
> `components/prefer-existing-component` move to B2 (both need the inventory).
> `components/standardized-variant-props` is B3. Stacked on `feat/color-to-90`'s
> honest-measurement infra.

## Goal

Add two new socle rules, born `experimental` / off-score, measured honestly:
- **`ai-surface/component-manifest-completeness`** — each component entry in the
  manifest declares `props` / `variants` / `examples` (completeness, not mere
  existence). A deterministic structural check (Tier-B, precision 1.0 by
  construction).
- **`components/no-arbitrary-tailwind`** — non-color arbitrary Tailwind values
  (`p-[12px]`, `text-[14px]`, `w-[37px]`…) that bypass the scale. A real detector
  (like color) — measured honestly on real code.

## Acceptance & promotion (decided)

- Both rules ship `experimental` / `contributesToScore: false`. No score change
  in B1; the actual flip is the single deliberate `v2→v3` bump bundled later
  (program-wide transverse rule).
- **Promotion-ready gate** (when the bump happens): `precisionMeasured ≥ 0.90 ∧
  nSamples ≥ 30 ∧ recall gate`. Per-rule honesty:
  - `component-manifest-completeness` is a **deterministic presence/structure
    check** → precision is structurally 1.0; it clears trivially but is **Tier-B**
    (it does NOT carry the reliability narrative — never sold as a "real
    detector"). N comes from real fixtures.
  - `no-arbitrary-tailwind` is a **real detector** → its ≥0.90 must be measured
    on **real code** (the harvested OSS/app corpus), recall preserved, no
    overfit. We do NOT assume it clears 90%; if it doesn't, it stays
    experimental with the honest number (exactly like color/shadow/contracts).
    It is plausibly cleaner than color (an arbitrary `[…]` value unambiguously
    bypasses the scale — far fewer indistinguishable cases than color's
    brand-hex problem) but that is an empirical question for measurement.

## What exists (reuse)

- `packages/core/src/rules/ai-surface-component-manifest-json.ts` — locates +
  validates the manifest (existence + per-entry `name` + `sourceFile`/`import`).
  It declares but does NOT read `props`/`tags`/`description`. completeness builds
  ON the same manifest discovery, reading the content fields it ignores.
- `packages/core/src/rules/tokens-no-hardcoded-color.ts` — already scans
  `className` strings for Tailwind arbitrary COLOR values (`bg-[#hex]`). The
  `className`-scanning approach is the pattern `no-arbitrary-tailwind` mirrors,
  for NON-color arbitraries.
- `createLyseRule` contract, the reliability catalogue (`sub-axes.ts`), the
  parity test (a registry rule REQUIRES a sub-axis entry), the coverage gate,
  `rules-manifest.json` (regenerated build artifact).

## Rule 1 — `ai-surface/component-manifest-completeness`

**Axis:** ai-surface. **Severity:** info (advisory, like other ai-surface
presence checks). **Status:** stable-eligible (deterministic) but ships
experimental until the bump.

**What it checks.** For each component entry in the discovered manifest, flag the
entry when it is missing completeness fields:
- `props`: a non-empty list of documented props (the agent/dev needs the prop
  contract).
- `variants`: present when the component exposes variants (if the manifest
  schema carries a `variants` field and it is empty/absent → flag).
- `examples`: at least one usage example reference.

**Boundary vs `manifest-json`.** manifest-json = "manifest exists + each entry
has name + source". completeness = "each entry is filled out (props/variants/
examples)". Existence ≠ completeness — zero overlap. If no manifest exists,
completeness emits nothing (manifest-json owns the absence signal); completeness
only speaks when a manifest is present.

**opportunities** = number of component entries inspected. **Determinism:** pure
structural read of the manifest JSON; no LLM, no nondeterminism.

## Rule 2 — `components/no-arbitrary-tailwind`

**Axis:** components. **Severity:** warning. **Status:** experimental until
measured.

**What it flags.** Tailwind arbitrary values `<prefix>-[<value>]` in `className`
strings (JSX/TSX attributes + CSS-in-JS template literals) where the bracket
value is **NOT a color**:
- spacing/size/layout: `p-[12px]`, `m-[8px]`, `w-[37px]`, `h-[3.5rem]`,
  `gap-[10px]`, `top-[7px]`, `inset-[2px]`
- radius/border: `rounded-[3px]`, `border-[3px]`
- typography size/leading: `text-[14px]`, `leading-[19px]`, `tracking-[0.5px]`
- etc. — any arbitrary non-color utility bypasses the configured scale = drift.

**Ownership split (zero overlap with color).** The decision key is the bracket
VALUE TYPE: if `[<value>]` is a color (`#hex`, `rgb()/rgba()/hsl()/oklch()`, or a
named color) → that belongs to `tokens/no-hardcoded-color` (already). If it is a
non-color literal → `no-arbitrary-tailwind`. So `bg-[#fff]` and `text-[#111]`
are color's; `p-[12px]` and `text-[14px]` are this rule's. Same prefix
(`text-`), different owner by value type — explicit and tested.

**Anti-FP.** Reuse `_skip-context`/`_exclude` (token-def files, stories/tests,
vendored, generated/compiled CSS). Scale utilities (`p-4`, `text-sm`,
`rounded-md`) are NOT arbitrary → never flagged (only the `[…]` form). `var()`
inside brackets (`w-[var(--x)]`) is a token reference → not flagged.

**opportunities** = number of `className` arbitrary-value candidates inspected.
**Determinism:** regex pre-filter on `className` + value-type classification; no
LLM.

## Testing strategy

- TDD per rule.
- completeness fixtures: a manifest with complete entries (no flag) + entries
  missing props/variants/examples (flag each) + no-manifest (silent).
- no-arbitrary-tailwind fixtures: real arbitrary patterns (flag) + recall
  guards: scale utilities `p-4`/`text-sm` (no flag), color brackets `bg-[#fff]`
  (NOT this rule — color's), `var()` brackets (no flag), token-def/story files
  (skipped).
- Catalogue parity: each new rule REQUIRES a `sub-axes.ts` entry (parity test) +
  a coverage classification + regenerated `rules-manifest.json`. Honest catalogue
  values: completeness 1.0 (deterministic, structural); no-arbitrary-tailwind
  starts unmeasured/experimental (real measurement is the harvest step) — do NOT
  paste a synthetic 1.0 (the color/sub-A lesson).
- Full `packages/core` suite green; `pnpm validate:autonomous` ENGINE GATE PASS
  (new rules get construction-oracle adapters; experimental rules are not J=1
  gated per sub-project A's status-aware gate).

## Global constraints

- Strict TS; ESM `.js`. Determinism byte-for-byte; no Date.now()/Math.random();
  fixed `lastCalibrated`.
- Rule metadata in the rule file via `createLyseRule`; never edit `manifest.ts`.
  Regenerate `rules-manifest.json` (tracked artifact) + docs via the generators.
- No LLM in the score. No overfit (general signals only — no sample-repo names).
- New rules born experimental / off-score; no score change in B1.
- Conventional Commits; branch `feat/color-to-90` (or a fresh `feat/socle-b1`
  off it — decide at plan time). All artifacts English.

## Risks

- **no-arbitrary-tailwind may not clear 90% honestly** → measured on real code;
  honest experimental fallback (color lesson). Likely cleaner than color but not
  assumed.
- **completeness over-claiming** → it is explicitly Tier-B (structural), never
  sold as a real detector; honest catalogue value (1.0 deterministic, real N).
- **Tailwind value-type classification edge cases** (e.g. `min-w-[20ch]`,
  `grid-cols-[1fr_2fr]`) → flag conservatively; non-color non-token arbitrary =
  drift; `var()`/token refs exempt. Tune on the harvest.

## Non-goals

- `no-style-escape-hatch`, `prefer-existing-component` (B2 — need the inventory).
- `standardized-variant-props` (B3).
- Figma. The deliberate v2→v3 score bump (program-wide, later).
