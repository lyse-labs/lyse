# `tokens/no-hardcoded-border-radius`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded `border-radius` lengths that don't come from a radii token scale.

## Why

Inconsistent corner radii (4px here, 6px there, 8px elsewhere) make a system feel unpolished. A small named radii scale keeps roundedness consistent across components.

## How

Scans CSS / CSS-in-JS for `border-radius` (and the corner longhands) length literals (px/rem/em). Exempt: `0`, percentages, the fully-rounded pill idiom (≥ 999px), and tokenized references (`var(--radius-*)`). When a radii scale is loaded (`ctx.tokens.radii`), on-scale values are compliant; off-scale values are flagged.

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
