# `tokens/no-hardcoded-border-width`

> **Axis:** Tokens · **Severity:** warning (`near`) / info (`novel`) · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded border-width lengths that don't come from a border-width token scale.

## Why

Border thicknesses beyond the default hairline (`2px`, `3px`, `0.5px`) should be deliberate, named choices, not magic numbers sprinkled per component. A small border-width scale keeps emphasis borders consistent.

## How

Scans CSS / CSS-in-JS for the `border-width` / `border-<side>-width` longhands **and** the first length inside a `border` / `border-<side>` shorthand. Exempt: `0`, the ubiquitous `1px` hairline, and tokenized references (`var(--border-width-*)`). When a border-width scale is loaded (`ctx.tokens.borderWidth`), on-scale values are compliant; off-scale values are flagged.

## How the value is resolved

On a full `lyse audit`, every border-width literal is resolved against the repo's own border-width scale, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). The resolution places the value in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | The value is on the repo's own border-width scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a token (needs a scale with at least two entries — see below) | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real value that resembles no token on this axis | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions`. **Unreachable on this axis** (see below) |

**`near` needs at least two tokens on the axis.** A one-token axis has no adjacent gap, so it has no observable step unit and "one step away" would be a manufactured number — every non-matching value on such an axis resolves `novel` instead. An exact hit on a one-token axis still resolves `exact`.

`unresolved` is listed for completeness only: this rule's extractor matches a numeric literal and nothing else, so `var(--x)` / `$var` / keyword values never reach the resolver and this axis contributes 0 to `meta.abstentions`.

Lengths normalize to px assuming a **16px root** (`rem` / `em` × 16), so a literal written in px compares correctly against a scale authored in rem and vice versa. A repo that overrides the root font size sees advisory `near` / `novel`, never a false `exact`.

**There is no fallback scale on this axis.** A repo with no border-width tokens at all resolves every border-width literal `novel`, so it gets `info` rather than `warning`. That is a real behaviour change: before the migration those same literals were reported as warnings.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
.active { border: 3px solid; }
```

## Good

```css
:root { --border-width-thick: 2px; }
.active { border: var(--border-width-thick) solid; }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-border-width
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)

## Reliability

<!-- reliability:auto:start -->
- novel · app: not measured
<!-- reliability:auto:end -->
