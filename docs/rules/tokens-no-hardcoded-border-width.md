# `tokens/no-hardcoded-border-width`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Flags hardcoded border-width lengths that don't come from a border-width token scale.

## Why

Border thicknesses beyond the default hairline (`2px`, `3px`, `0.5px`) should be deliberate, named choices, not magic numbers sprinkled per component. A small border-width scale keeps emphasis borders consistent.

## How

Scans CSS / CSS-in-JS for the `border-width` / `border-<side>-width` longhands **and** the first length inside a `border` / `border-<side>` shorthand. Exempt: `0`, the ubiquitous `1px` hairline, and tokenized references (`var(--border-width-*)`). When a border-width scale is loaded (`ctx.tokens.borderWidth`), on-scale values are compliant; off-scale values are flagged.

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

Value-drift rule — **experimental** and reported-only; does not contribute to the Health Score until calibrated.

## See also

- [Health Score](../guide/health-score.md)
