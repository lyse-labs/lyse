# `a11y/forced-colors`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Status:** scored (v1)

Checks, at repo level, whether a design system that paints colors also ships a forced-colors / high-contrast affordance.

## Why

Windows High Contrast Mode — surfaced to CSS as `forced-colors: active` — replaces the author's palette with a small user-chosen set. Components that lean on background color alone for shape, on `box-shadow` for elevation, or on color alone to convey state can become invisible or meaningless in that mode. The `forced-colors` and `prefers-contrast` media features, plus `forced-color-adjust` and system color keywords, let a design system stay legible for low-vision users who depend on these modes.

## How

The check is **repo-level**:

1. **Paints color?** — scans CSS and extracted CSS-in-JS for a color-bearing declaration (`color` / `background` / `background-color` / `border-color` / `fill` / `stroke` / `box-shadow` / `outline-color`) with a non-noop value.
2. **Affordance present?** — looks for any of: `@media (forced-colors: …)`, `@media (prefers-contrast: …)`, the `forced-color-adjust` property, the legacy `-ms-high-contrast` query, a high-contrast theme selector (`.high-contrast`, `.hc`, `[data-theme*="contrast"]`), or a `matchMedia('(forced-colors: …)')` call in JS/TS.

If the system paints color but no affordance is found anywhere, the rule emits **one** warning. If an affordance exists — or no color is painted — it emits nothing (the latter is N/A).

## Bad

```css
.btn { background: var(--accent); box-shadow: 0 1px 2px rgba(0,0,0,.2); }
/* no forced-colors handling — disappears in High Contrast Mode */
```

## Good

```css
.btn { background: var(--accent); }
@media (forced-colors: active) {
  .btn { border: 1px solid ButtonText; }
}
```

## What does NOT trigger this rule

- A design system with any forced-colors / `prefers-contrast` / `forced-color-adjust` / high-contrast affordance.
- Layout-only CSS that paints no colors (N/A).

## Allowlist

```
lyse-disable a11y/forced-colors
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.916).

## See also

- [`a11y/prefers-reduced-motion`](./a11y-prefers-reduced-motion.md) — the sibling OS-preference affordance check.
- [MDN: `forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
