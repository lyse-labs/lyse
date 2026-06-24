# `tokens/no-hardcoded-typography`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded `font-size`, `font-weight`, and `letter-spacing` values that don't come from a typography token scale.

## Why

A type scale (`--font-size-sm/md/lg`, `--font-weight-regular/semibold`) is the backbone of a design system's voice. Ad-hoc `font-size: 13px` / `font-weight: 650` scattered per component erode that scale into dozens of near-duplicates.

## How

Scans CSS / CSS-in-JS for three properties and checks them against `ctx.tokens.typography` (with `weight/` and `letter-spacing/` prefixed keys). Exemptions keep precision high:

- **`font-size`** — only px/rem/em are checked; percentages and keywords (`larger`, `medium`, …) are exempt.
- **`font-weight`** — the canonical `400`/`700` and all keywords (`normal`, `bold`, …) are exempt; other off-scale numerics are flagged.
- **`letter-spacing`** — `0` and `normal` are exempt.
- **`var(...)`** is always exempt.

**`line-height` is intentionally out of scope** — unitless line-heights (`1.4`, `1.5`) are pervasive and rarely tokenized, so flagging them is noise rather than signal.

## Bad

```css
.label { font-size: 13px; font-weight: 650; }
```

## Good

```css
:root { --font-size-sm: 13px; --font-weight-semibold: 600; }
.label { font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-typography
```

## Status

Value-drift rule — **stable** and **scored**: it contributes to the Health Score.

## See also

- [Health Score](../guide/health-score.md)
