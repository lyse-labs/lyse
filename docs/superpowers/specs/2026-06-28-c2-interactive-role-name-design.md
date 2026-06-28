# Sub-project C2 — a11y/interactive-role-name — Design

> Next C-rule after contrast-tokens. Covers the accessible-NAME gap on
> interactive controls that `a11y/essentials` leaves out. Stacked on
> `feat/color-to-90`.

## Goal

Flag interactive controls that lack an accessible name (an empty/icon-only
`<button>` with no `aria-label`/text, a custom control without a label) by
wrapping the battle-tested `jsx-a11y/control-has-associated-label` rule —
exactly the way `a11y/essentials` wraps its 5 jsx-a11y rules. Born
`experimental` / off-score.

## Why a wrapper (not a hand-rolled detector)

`a11y/essentials` (`packages/core/src/rules/a11y-essentials.ts`) already runs
`eslint-plugin-jsx-a11y` rules via an in-process ESLint harness and wraps:
`alt-text`, `anchor-has-content`, `label-has-associated-control`,
`role-has-required-aria-props`, `aria-role`. The upstream impl is battle-tested
across millions of repos — Lyse deliberately depends on it rather than
re-porting. `interactive-role-name` follows the same pattern for the ONE
accessible-name rule essentials omits.

## What it wraps (the net-new, zero overlap)

`jsx-a11y/control-has-associated-label` — every interactive control element
(button, custom interactive) must have an accessible label (text content,
`aria-label`, `aria-labelledby`, or a `title`).

**Boundary vs `a11y/essentials` (no overlap):** essentials' 5 rules cover
images (alt-text), links (anchor-has-content), form inputs
(label-has-associated-control), and ARIA validity (role-has-required-aria-props,
aria-role). None of them is `control-has-associated-label`, which targets
buttons / custom interactive controls' accessible names — the complementary gap.

## Architecture

Mirror `a11y-essentials.ts`:
- reuse the same in-process ESLint + `eslint-plugin-jsx-a11y` harness (extract
  the shared harness if it isn't already a shared helper; otherwise replicate
  the minimal flat-config + lint-text path essentials uses),
- run ONLY `jsx-a11y/control-has-associated-label` (warn),
- map each ESLint message to a `Finding` (axis `a11y`, severity `warning`,
  file/line from the message),
- `opportunities` = interactive control elements inspected (or, pragmatically and
  consistent with how essentials computes it, a per-file/element count — match
  essentials' opportunities convention).

YAGNI: just this one rule. NOT `interactive-supports-focus` (that's focusability,
not naming) — out of scope.

## Testing

- Fixture: `<button aria-label="Close"><Icon/></button>` → no flag; `<button><Icon/></button>` (icon-only, no name) → flag; `<button>Save</button>` (text content) → no flag.
- Confirm zero overlap: a bare `<input>` without a label is essentials'
  `label-has-associated-control`, NOT this rule (don't double-flag) — verify the
  wrapped rule set is exactly `control-has-associated-label`.
- Catalogue parity (sub-axes entry + coverage classification + regenerated
  rules-manifest.json), construction-oracle adapter (J=1), full suite green,
  `validate:autonomous` ENGINE GATE PASS.
- HONEST catalogue: experimental / off-score. jsx-a11y is deterministic
  (battle-tested, Tier-B robust); the entry starts unmeasured (null / nSamples 0)
  — adapter has NO `falseFriends` so the coherence test allows null (the pattern
  established across the program's experimental rules). Real promotion via the
  measurement campaign.

## Global constraints

- Strict TS; ESM `.js`. Determinism (ESLint on fixed input is deterministic; no
  Date.now/Math.random). Born experimental / `contributesToScore: false`; no
  score change. No LLM. No overfit.
- Rule via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes
  entry + coverage classification.
- Conventional Commits; branch `feat/color-to-90`. English.

## Risks

- Sharing the ESLint harness: if `a11y-essentials.ts`'s harness isn't factored
  out, replicate minimally (don't refactor essentials destructively — it's
  stable/scored).
- jsx-a11y version: the plugin is already a dependency (essentials uses it); no
  new dep.
- 90% is the measurement campaign's job; ships experimental.

## Non-goals

- `interactive-supports-focus` / other jsx-a11y rules. `stories/props-documented`
  + `stories/usage-examples` (next C pair). `standardized-variant-props` (B3).
  The bundled v2→v3 score bump (later).
