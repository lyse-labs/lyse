# `tokens/no-hardcoded-opacity`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Flags hardcoded fractional `opacity` values that don't come from an opacity token scale.

## Why

Ad-hoc opacity values (`0.65`, `0.38`, `0.87`) scattered across a system produce subtly inconsistent muted / disabled / overlay states. A small named opacity scale keeps them coherent.

## How

Scans CSS / CSS-in-JS for `opacity: <number>`. The semantic extremes `0` and `1` (and `0%` / `100%`) and tokenized references (`var(--opacity-*)`) are exempt. When an opacity scale is loaded (`ctx.tokens.opacity`), on-scale values are compliant; off-scale values are flagged.

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

Value-drift rule — **experimental** and reported-only; does not contribute to the Health Score until calibrated.

## See also

- [Health Score](../guide/health-score.md)
