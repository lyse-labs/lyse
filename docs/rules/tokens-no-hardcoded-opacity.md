# `tokens/no-hardcoded-opacity`

> **Axis:** Tokens · **Severity:** warning (`near`) / info (`novel`) · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded fractional `opacity` values that don't come from an opacity token scale.

## Why

Ad-hoc opacity values (`0.65`, `0.38`, `0.87`) scattered across a system produce subtly inconsistent muted / disabled / overlay states. A small named opacity scale keeps them coherent.

## How

Scans CSS / CSS-in-JS for `opacity: <number>`. The semantic extremes `0` and `1` (and `0%` / `100%`) and tokenized references (`var(--opacity-*)`) are exempt. When an opacity scale is loaded (`ctx.tokens.opacity`), on-scale values are compliant; off-scale values are flagged.

## How the value is resolved

On a full `lyse audit`, every opacity literal is resolved against the repo's own opacity scale, derived from the Design System Graph (Tailwind config, `*.tokens.json`, CSS custom properties, SCSS variables). A percentage is normalized to its fraction (`65%` → `0.65`) before resolution. The resolution places the value in exactly one of four classes:

| Class | Meaning | What this rule emits |
|---|---|---|
| `exact` | The value is on the repo's own opacity scale | nothing — this is compliant usage, not drift |
| `near` | One scale step away from a token | **warning**, confidence medium; the candidate token is named in the suggestion |
| `novel` | A real value that resembles no token on this axis | **info**, confidence low |
| `unresolved` | Not judgeable statically (`var(--x)`, a SCSS `$var`, a CSS-wide keyword) | nothing — counted in the audit's `meta.abstentions` |

Opacity is a unitless axis, so the 16px-root length normalization that applies to the length-valued axes (spacing, radii, border widths, breakpoints) is not involved here.

**There is no fallback scale on this axis.** A repo with no opacity tokens at all resolves every opacity literal `novel`, so it gets `info` rather than `warning`. That is a real behaviour change: before the migration those same literals were reported as warnings.

The resolver only exists on a full `lyse audit`. Single-file surfaces — MCP `audit_file`, IDE contexts, codemod contexts — have no repo-wide scale and keep the pre-migration behaviour: an exact-match token lookup and an unconditional `warning`.

## Bad

```css
.muted { opacity: 0.65; }
```

## Good

```css
:root { --opacity-muted: 0.6; }
.muted { opacity: var(--opacity-muted); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-opacity
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)
