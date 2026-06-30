# Sub-project B2a — components/no-style-escape-hatch — Design

> First piece of sub-project B2 (components-reuse layer). B2a = the achievable
> rule now that B1's manifest parsing gives a "DS component" substrate.
> `components/prefer-existing-component` (the impératif n°1, hardest architecture)
> is B2b — its own dedicated design cycle. Stacked on `feat/color-to-90`.

## Goal

Flag an inline `style={{...}}` prop on a **DS component** (a JSX element whose
tag resolves to the configured design system) — it bypasses the component's prop
API (the escape hatch). Born `experimental` / off-score. It is a real detector,
so its precision is **measured honestly on real code**; target **≥ 0.90 real
precision** (the socle bar), promotion-ready iff cleared, honest experimental
fallback otherwise.

## The 90% commitment, honestly (program rule)

The socle bar is ≥ 0.90 precision. We pursue it genuinely and measure it on real
OSS/app code (the harvest), recall preserved, no overfit. If the rule clears the
gate → promotion-ready (flip at the single bundled v2→v3 bump). If it hits a
structural wall (as `tokens/no-hardcoded-color` did), we publish the honest
number and keep it experimental rather than fake the gate. `no-style-escape-hatch`
is plausibly cleaner than color (a `style` prop on a DS component is an
unambiguous structural signal — far fewer indistinguishable cases), so 90% is a
realistic target here, but it remains an empirical outcome to measure.

## What it flags

A JSX element `<X style={{ ... }} />` (or `style={expr}`) where `X` is a **DS
component** — i.e. `X` is either:
- imported from the configured `componentsModule` (`.lyse.yaml` →
  `designSystem.componentsModule`, e.g. `@org/ui`), OR
- listed in the parsed component manifest (reuse B1's manifest reader).

The finding is **value-agnostic**: ANY inline `style` on a DS component is the
escape hatch (overriding the component's styling contract instead of using its
props), regardless of the style's contents.

## Boundaries (zero overlap — decided)

- **Raw HTML elements** (`<div style={{}}>`, `<span style=…>`) are NOT flagged —
  a div with inline style is legitimate; the escape hatch is specifically
  bypassing a *DS component's* API.
- **Non-DS custom components** (`<MyLocalThing style=…>` not from the DS) are NOT
  flagged.
- **`className` arbitrary values** belong to `components/no-arbitrary-tailwind`
  (B1) — this rule only speaks to the `style` prop presence.
- **Hardcoded values** (color/spacing) belong to their token rules — this rule is
  value-agnostic (it flags the `style` prop, not what's in it). So a
  `<Button style={{ color: '#fff' }}>` yields: color flags `#fff`,
  no-style-escape-hatch flags "inline style on a DS component" — these are
  DISTINCT axes (the specific value vs the structural bypass), not a double-flag
  of the same thing. (This is the agreed "separation by responsibility": the
  value rule owns the value; the escape-hatch rule owns the structural contract
  bypass. The `style` prop presence is owned by no rule except this one.)

## Anti-FP / recall

- **`dsSelfMode`** (auditing the DS repo itself — the existing
  `dsSelfMode`/"workspace DS export" signal in `audit-pipeline.ts`): inside the
  DS repo, its own components ARE the implementation; an inline `style` there is
  not a consumer bypassing the API. So in `dsSelfMode`, do NOT flag (the rule
  targets consumer code escape-hatching DS components). Degrade gracefully: if
  the mode can't be determined, prefer NOT flagging the DS's own source.
- **Tag resolution must be real:** resolve `X` to its import; only flag when the
  import is the configured DS module (or the manifest lists it). A locally
  defined `X` shadowing a DS name is NOT the DS component.
- **`style` spread / dynamic** (`style={props.style}`, `style={{ ...rest }}`) —
  still an inline-style override on a DS component = still a bypass; flag
  (value-agnostic). (Revisit only if the harvest shows these are predominantly
  legitimate pass-throughs.)

## Architecture

```
ts-morph AST (the shared project) → JSX elements with a `style` attribute
        │  resolve the element's tag to its import / manifest entry
        ▼
is the tag a DS component? (imported from componentsModule OR in the manifest)
        │  AND not dsSelfMode
        ▼  yes
finding: "Inline style on DS component <X> bypasses its prop API"  (value-agnostic)
        │  opportunities = DS-component JSX elements inspected
        ▼
experimental / off-score → honest real-code measurement → ≥0.90 ⇒ promotion-ready
```

### Design units

- A small **DS-component resolver** (shared, reusable by B2b later): given a JSX
  tag + the file's imports + the parsed manifest + `componentsModule`, answer
  "is this a DS component?". This is the substrate both B2a and B2b need —
  build it cleanly here, B2b consumes it.
- The rule itself: walk JSX `style` attributes, consult the resolver, emit.

## Testing strategy

- TDD. Fixtures: `<Button style={{color:'#fff'}}>` where Button is imported from
  the DS module → flag; `<div style={{}}>` → NOT flag (raw HTML); `<MyThing
  style=…>` (non-DS) → NOT flag; DS component WITHOUT style → NOT flag; the same
  DS-component-with-style inside `dsSelfMode` → NOT flag.
- Recall guards: a real DS-component inline-style override flags; raw HTML never
  does.
- Catalogue parity (new rule → sub-axes entry + coverage classification +
  regenerated rules-manifest.json), construction-oracle adapter (J=1), full suite
  green, `validate:autonomous` ENGINE GATE PASS.
- HONEST catalogue: starts UNMEASURED (precision/recall null, nSamples 0,
  experimental, off-score) — real precision is the harvest step, NOT a synthetic
  number.

## Global constraints

- Strict TS; ESM `.js`. Determinism byte-for-byte; no Date.now()/Math.random();
  fixed `lastCalibrated` (or null when unmeasured).
- AST via the shared ts-morph project; degrade gracefully (unresolvable tag /
  no manifest / unknown mode → do NOT flag; favor recall-safety toward NOT
  over-flagging the DS's own code).
- No LLM in the score. No overfit (resolver is general — no sample-repo names).
- Born experimental / `contributesToScore: false`; no score change in B2a.
- Rule metadata via `createLyseRule`; regenerate `rules-manifest.json` + docs;
  add sub-axes entry + coverage classification (parity + completeness gates).
- Conventional Commits; branch `feat/color-to-90`. English.

## Risks

- **90% empirical, not guaranteed** → measured on real code; honest experimental
  fallback if it hits a wall (color lesson). Good odds (structural signal).
- **DS-component resolution edge cases** (re-exports, barrel files, aliased
  imports) → resolve conservatively; when unsure, do NOT flag (recall-safe toward
  under-flagging rather than false-positiving on non-DS elements).
- **dsSelfMode** must be respected or the rule floods the DS's own repo with FPs.

## Non-goals

- `prefer-existing-component` (B2b — dedicated cycle; the DS-component resolver
  built here is its substrate).
- `standardized-variant-props` (B3). Figma. The bundled v2→v3 score bump (later).
