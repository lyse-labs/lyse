# `tokens/no-hardcoded-border-radius`

> **Axis:** Tokens · **Severity:** warning (`near`) / info (`novel`) · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded `border-radius` lengths that don't come from a radii token scale.

## Why

Inconsistent corner radii (4px here, 6px there, 8px elsewhere) make a system feel unpolished. A small named radii scale keeps roundedness consistent across components.

## How

Scans CSS / CSS-in-JS for `border-radius` (and the corner longhands) length literals (px/rem/em). Exempt: `0`, percentages, the fully-rounded pill idiom (≥ 999px), and tokenized references (`var(--radius-*)`). When a radii scale is loaded (`ctx.tokens.radii`), on-scale values are compliant; off-scale values are flagged.

## How the value is resolved

On a full `lyse audit`, every radius literal is resolved against the repo's own radii scale, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). The resolution places the value in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | The value is on the repo's own radii scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a token (needs a scale with at least two entries — see below) | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real value that resembles no token on this axis | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions`. **Unreachable on this axis** (see below) |

**`near` needs at least two tokens on the axis.** A one-token axis has no adjacent gap, so it has no observable step unit and "one step away" would be a manufactured number — every non-matching value on such an axis resolves `novel` instead. An exact hit on a one-token axis still resolves `exact`.

`unresolved` is listed for completeness only: this rule's extractor matches a numeric literal and nothing else, so `var(--x)` / `$var` / keyword values never reach the resolver and this axis contributes 0 to `meta.abstentions`.

Lengths normalize to px assuming a **16px root** (`rem` / `em` × 16), so a literal written in px compares correctly against a scale authored in rem and vice versa. A repo that overrides the root font size sees advisory `near` / `novel`, never a false `exact`.

**There is no fallback scale on this axis.** A repo with no radii tokens at all resolves every radius literal `novel`, so it gets `info` rather than `warning`. That is a real behaviour change: before the migration those same literals were reported as warnings.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
.card { border-radius: 6px; }
```

## Good

```css
:root { --radius-md: 8px; }
.card { border-radius: var(--radius-md); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-border-radius
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)
