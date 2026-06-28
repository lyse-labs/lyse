# Sub-project C1 — a11y/contrast-tokens — Design

> The experts' "trou majeur": no STATIC contrast checking exists today (only
> `a11y/runtime-axe`, render-only/experimental). C1 adds a deterministic static
> WCAG-contrast check on **co-applied** foreground/background token pairs.
> Stacked on `feat/color-to-90`. Sub-project C of the socle.

## Goal

Flag a **co-applied** foreground/background pair — a CSS rule (or CSS-in-JS
object, or inline `style`) that declares BOTH a text color (`color`) AND a
background (`background`/`background-color`) — whose resolved colors fail WCAG AA
contrast. Born `experimental` / off-score; precision measured honestly on real
code, target ≥0.90, promotion-ready iff cleared (else experimental, color-honesty).

## What it flags

Within one CSS rule / style block that sets BOTH:
- a foreground: `color: <X>`, and
- a background: `background-color: <Y>` or a solid `background: <Y>`,

resolve `<X>` and `<Y>` to concrete opaque color values, compute the WCAG 2.x
contrast ratio, and flag if `ratio < threshold`:
- **4.5:1** (AA, normal text) — the default,
- **3.0:1** when large text is detectable in the same rule (`font-size` ≥ 24px,
  or ≥ 18.66px with `font-weight` ≥ 700).

"On token pairs" = the pairs actually co-applied (resolved from `var(--token)`
references or literals).

## Token resolution

Resolve each side to a concrete color:
- `var(--token)` / token reference → resolve via the available forward token map
  (the DTCG canonical token map / `cssVarToTokenPath` built for
  `tokens/rendered-token-fidelity`, and/or `ctx.tokens`). If it resolves to a
  concrete hex/rgb/hsl → use it.
- a raw literal (`#fff`, `rgb(...)`) → use it directly.
- **Unresolvable** (token not found, no token map, dynamic value) → **skip the
  pair** (do NOT flag — we never guess a contrast verdict on an unknown color).

## WCAG contrast util (new, pure)

A pure module computing WCAG 2.x relative luminance + contrast ratio:
- parse a color string (`#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`/`rgb()`/`rgba()`/
  `hsl()`/`hsla()`/named) to sRGB channels,
- relative luminance `L = 0.2126·R + 0.7152·G + 0.0722·B` (with the sRGB
  linearization), contrast `(L1+0.05)/(L2+0.05)`,
- return `null` for unparseable / non-opaque (alpha < 1) inputs (caller skips).
Deterministic, fully unit-testable against known WCAG reference pairs.

## Anti-FP (precision-critical)

Flag ONLY when BOTH sides resolve to **opaque concrete** colors. Skip when:
- either side is unresolvable / dynamic / `currentColor` / `inherit` /
  `transparent`,
- either side has alpha < 1 (rgba/8-digit hex) — contrast over a translucent
  layer depends on what's beneath; we don't guess,
- the background is a gradient or image (`linear-gradient`, `url(...)`),
- the file is token-def / story / test / vendored / generated (reuse
  `_skip-context`/`_exclude`).
- the rule sets only one of the two (no co-applied pair) → not our concern.

`opportunities` = co-applied fg/bg pairs inspected (both resolvable).

## Boundaries (zero overlap)

- vs `tokens/no-hardcoded-color`: that flags hardcoded color VALUES; this checks
  the contrast RATIO of a co-applied pair — even when both are proper tokens.
  Orthogonal (a perfectly-tokenized pair can still fail contrast).
- vs `a11y/runtime-axe`: runtime-axe checks contrast only at RENDER (Storybook,
  experimental); this is STATIC on co-applied token pairs — the missing static
  capability the experts flagged.
- vs `a11y/essentials`: essentials wraps jsx-a11y (alt/labels/roles); no contrast.

## Architecture

```
CSS rules + CSS-in-JS objects + inline style blocks
        │  find blocks declaring BOTH a foreground (color) AND a background
        ▼
resolve fg + bg → concrete opaque colors (forward token map / literal; else skip)
        ▼
WCAG contrast util: ratio = contrast(L_fg, L_bg)
        │  threshold 4.5 (AA) / 3.0 (large text)
        ▼  ratio < threshold ⇒ finding "Contrast <ratio> for <fg> on <bg> is below WCAG AA (<threshold>)"
experimental / off-score → honest real-code measurement → ≥0.90 ⇒ promotion-ready
```

### Design units

- `packages/core/src/a11y/contrast.ts` (or `rules/_contrast.ts`) — the pure WCAG
  util (color-parse + luminance + ratio). Independently testable.
- the rule `packages/core/src/rules/a11y-contrast-tokens.ts` — co-applied-pair
  extraction (CSS + CSS-in-JS + inline style), token resolution, threshold,
  emit. Consumes the util + the forward token map.

## Testing strategy

- WCAG util: unit tests against reference pairs (black/white = 21:1; #767676 on
  white ≈ 4.54 ⇒ passes AA; #777 on white < 4.5 ⇒ fails; large-text 3:1 boundary).
- Rule: co-applied fail (flag), co-applied pass (no flag), only-fg-or-only-bg (no
  flag), unresolvable token (skip), alpha/transparent/gradient (skip), large-text
  threshold, token-def/story file (skip). Recall: a genuinely low-contrast
  co-applied pair flags.
- Catalogue parity (sub-axes entry + coverage classification + regenerated
  rules-manifest.json), construction-oracle adapter (J=1), full suite green,
  `validate:autonomous` ENGINE GATE PASS.
- HONEST catalogue: starts UNMEASURED (all null, nSamples 0, experimental,
  off-score) — real detector; real precision is the harvest step, NOT a synthetic
  number.

## Global constraints

- Strict TS; ESM `.js`. Determinism byte-for-byte; no Date.now()/Math.random();
  `lastCalibrated: null` while unmeasured.
- No LLM in the score (WCAG math is deterministic). No overfit.
- Born experimental / off-score; no score change in C1.
- Rule via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes
  entry + coverage classification (parity + completeness gates).
- Recall-safety toward NOT flagging: any unresolvable/ambiguous pair → skip.
- Conventional Commits; branch `feat/color-to-90`. English.

## Risks

- **Token resolution coverage:** if a repo's tokens aren't resolvable (no DTCG /
  no forward map), many pairs skip → low coverage but no FPs (recall-safe). 90%
  precision is plausible (WCAG math is exact; the FP risk is mis-resolution or
  bg-set-elsewhere, both mitigated by skip-on-unresolvable + same-rule-only).
- **Same-rule-only misses cross-rule pairs** (bg on parent, fg on child) — v1
  scope; documented; expand later if the harvest shows it matters.
- **90% empirical** → measured on real code; honest experimental fallback.

## Non-goals

- Cross-rule / inherited-background contrast (v1 = same-rule co-applied).
- Non-text contrast (UI component / graphical) beyond the large-text rule.
- `a11y/interactive-role-name`, `stories/props-documented`, `stories/usage-examples`
  (later C items); `standardized-variant-props` (B3); the bundled v2→v3 bump.
