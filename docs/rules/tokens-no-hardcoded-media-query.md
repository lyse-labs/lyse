# `tokens/no-hardcoded-media-query`

> **Axis:** Tokens · **Severity:** warning (`near`) / info (`novel`) · **Auto-fixable:** no · **Status:** scored (v1)

Flags raw `px` / `rem` / `em` literals used as breakpoint values inside `@media` width/height features, when they are not on the tokenized breakpoint scale.

## Why

A design system's breakpoints are a shared vocabulary. When media queries hardcode `768px` in one component and `760px` in another, layouts break at inconsistent widths and there is no single source of truth for the responsive grid. Referencing a tokenized breakpoint scale keeps every component snapping to the same widths.

This is the **per-occurrence** complement to [`tokens/responsive-breakpoints`](./tokens-responsive-breakpoints.md), which only checks at repo level whether a breakpoint scale exists at all.

## How

1. Extracts every `@media` prelude (the text up to the opening `{`) from CSS, SCSS, and extracted CSS-in-JS.
2. Within each prelude, finds raw numeric literals in width/height features — both colon syntax (`min-width: 768px`, `max-height: 40rem`) and range syntax (`width >= 600px`).
3. Emits a finding for each literal that is **not** on the breakpoint scale, at the severity the resolver's verdict warrants (see below).

A tokenized breakpoint — SCSS `$breakpoint-*` interpolation, a custom property, or a JS `breakpoints` map — produces no raw numeric literal, so it never fires.

## How the value is resolved

On a full `lyse audit`, every breakpoint literal is resolved against the repo's own breakpoint scale, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). The resolution places the value in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | The value is on the repo's own breakpoint scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a token (needs a scale with at least two entries — see below) | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real value that resembles no token on this axis | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions`. **Unreachable on this axis** (see below) |

**`near` needs at least two tokens on the axis.** A one-token axis has no adjacent gap, so it has no observable step unit and "one step away" would be a manufactured number — every non-matching value on such an axis resolves `novel` instead. An exact hit on a one-token axis still resolves `exact`.

`unresolved` is listed for completeness only: this rule's extractor matches a numeric literal and nothing else, so `var(--x)` / `$var` / keyword values never reach the resolver and this axis contributes 0 to `meta.abstentions`.

Lengths normalize to px assuming a **16px root** (`rem` / `em` × 16), so `@media (max-width: 40rem)` compares correctly against a `640px` breakpoint token and vice versa. A repo that overrides the root font size sees advisory `near` / `novel`, never a false `exact`.

**There is no fallback scale on this axis.** A repo with no breakpoint tokens at all resolves every media-query literal `novel`, so it gets `info` rather than `warning`. That is a real behaviour change: before the migration those same literals were reported as warnings.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
@media (min-width: 768px) { .grid { display: grid; } }
```

## Good

```scss
$breakpoint-md: 768px;
@media (min-width: $breakpoint-md) { .grid { display: grid; } }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-media-query
```

## What does NOT trigger this rule

- `min-width: 0` and other zero resets.
- A literal whose value matches a defined breakpoint token (treated as on-scale / consistent).
- A SCSS variable, custom property, or JS breakpoint reference (no raw literal).
- A `max-width:` sizing property in a normal rule body — that is a layout property, not a media-query breakpoint, and is the [`tokens/no-hardcoded-spacing`](./tokens-no-hardcoded-spacing.md) rule's territory.
- A media query that lives inside a comment.

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.912, precision LB 0.912).

## See also

- [`tokens/responsive-breakpoints`](./tokens-responsive-breakpoints.md) — the repo-level presence check.
- [MDN: Using media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
