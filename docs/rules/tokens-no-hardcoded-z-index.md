# `tokens/no-hardcoded-z-index`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Flags hardcoded `z-index` values that don't come from a z-index token scale.

## Why

Z-index without a shared scale is one of the most common sources of UI bugs in a design system: each component picks an arbitrary large number to "win", and overlays, dropdowns, tooltips, and modals end up fighting unpredictably (`z-index: 9999` … `z-index: 99999`).

A small, named scale (`--z-dropdown`, `--z-modal`, `--z-toast`) makes stacking order an explicit, reviewable decision shared across the system.

## How

Scans CSS and CSS-in-JS for `z-index: <integer>` declarations.

- **Trivial local values** `-1`, `0`, `1` are never flagged (legitimate local stacking contexts).
- **Tokenized references** (`z-index: var(--z-modal)`) are not flagged.
- When a z-index **token scale** is loaded (`ctx.tokens.zIndex`), values **on the scale** are compliant; **off-scale** values are flagged.
- With no scale loaded, any non-trivial hardcoded value is flagged (the system has no shared ordering).

## Bad

```css
.modal { z-index: 9999; }
```

## Good

```css
:root { --z-modal: 400; }
.modal { z-index: var(--z-modal); }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-z-index
```

## Status

This is a value-drift rule; like the other hardcoded-value detectors it is **stable** and **scored**: it contributes to the Health Score.

## See also

- [MDN: `z-index`](https://developer.mozilla.org/en-US/docs/Web/CSS/z-index)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
