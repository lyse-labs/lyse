# `tokens/no-hardcoded-shadow`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Flags hardcoded `box-shadow` values that don't come from a shadow token scale.

## Why

Elevation is a system-level language: a handful of named shadows (`--shadow-sm/md/lg`) communicate depth consistently. Hand-rolled `box-shadow` values per component drift into a dozen near-identical-but-not blurs and opacities.

## How

Scans CSS / CSS-in-JS for `box-shadow` declarations. Keyword values (`none`, `inherit`, …) and tokenized references (`var(--shadow-*)`) are exempt. When a shadow scale is loaded (`ctx.tokens.shadows`), values matching a token (whitespace-insensitive) are compliant; everything else is flagged. The full declaration value is treated as one unit — a shadow is a composite token, not per-length drift.

## Bad

```css
.card { box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
```

## Good

```css
:root { --shadow-sm: 0 1px 3px rgba(0,0,0,0.1); }
.card { box-shadow: var(--shadow-sm); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-shadow
```

## Status

Value-drift rule — **experimental** and reported-only; does not contribute to the Health Score until calibrated.

## See also

- [Health Score](../guide/health-score.md)
