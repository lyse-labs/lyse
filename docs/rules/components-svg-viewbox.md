# `components/svg-viewbox`

> **Axis:** Components · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Flags inline `<svg>` icons that have no `viewBox` attribute.

## Why

An inline `<svg>` without a `viewBox` is locked to its intrinsic pixel size. Scaling it — a larger icon, a high-DPI display, a browser zoom — crops or distorts the artwork instead of resizing the coordinate system. A `viewBox` makes the icon resolution-independent; it is the single most important attribute for a scalable icon.

The check is purely **structural** — it asks only whether the attribute is present, never inspecting its value — so synthetic precision equals real precision, which is why it can contribute to the Health Score.

## Self-gating

A design system with no inline `<svg>` records **zero opportunities** and the rule is N/A (excluded from the score). It only grades the SVGs that exist.

## Where the rule looks

Every inline `<svg …>` opening tag in a parsed TypeScript/JavaScript (JSX) file. A tag carrying a JSX spread (`<svg {...props}>`) is **skipped** — the `viewBox` may be supplied at runtime, so flagging it would be a false positive. `<svgFoo>` and other substrings never match (word boundary after `svg`).

## Bad

```tsx
export const Icon = () => (
  <svg width="24" height="24">
    <path d="…" />
  </svg>
);
```

## Good

```tsx
export const Icon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24">
    <path d="…" />
  </svg>
);
```

## What the rule checks

| Severity | Condition |
|---|---|
| `warning` | An inline `<svg>` (without a `{...spread}`) that has no `viewBox` attribute |
| (none) | Every inline `<svg>` carries a `viewBox` — rule emits nothing |

## Allowlist

```tsx
// lyse-disable-next-line components/svg-viewbox
<svg width="24" height="24" />
```

`<svg {...props}>` is skipped automatically (not counted as an opportunity).

## See also

- [`components/no-icon-fonts`](./components-no-icon-fonts.md) — sibling icon-delivery rule (SVG over icon-font).
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
