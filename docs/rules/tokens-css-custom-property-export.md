# `tokens/css-custom-property-export`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** scored (v1)

Checks, at repo level, whether a design system that paints CSS also exports its theme as CSS custom properties.

## Why

CSS custom properties are the runtime-themeable surface of a design system: a consumer can read `--color-primary` and override it per brand, per mode, or per surface without rebuilding. A design system that locks its tokens in Sass variables or JS objects only — styling everything with literals — can't be re-themed at runtime and gives downstream products nothing to hook into.

## How

The check is **repo-level**:

1. **Paints CSS?** — scans CSS, SCSS, and extracted CSS-in-JS for any styling declaration (`prop: value;`).
2. **Exports custom properties?** — looks for at least one custom-property **definition** (`--name: value` in `:root`, a `[data-theme]` block, `html`, a `.theme-*` selector, or a Tailwind v4 `@theme` block).

Consuming a variable (`var(--x)`) does **not** count — only a definition does. If the system styles in CSS but defines no custom property anywhere, the rule emits **one** warning. If a definition exists — or the system ships no CSS — it emits nothing (the latter is N/A).

## Bad

```css
.btn { color: #3b82f6; background: #1e293b; }
/* tokens locked in literals — nothing exported to override */
```

## Good

```css
:root { --color-primary: #3b82f6; }
.btn { color: var(--color-primary); }
```

## What does NOT trigger this rule

- A repo with any custom-property definition (`:root`, `[data-theme]`, `@theme`, …).
- A design system that ships no CSS (N/A).
- A custom property mentioned only inside a comment (not a real export).

## Allowlist

```
lyse-disable tokens/css-custom-property-export
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.904).

## See also

- `tokens/responsive-breakpoints` — another repo-level theming/tokens presence check.
- [MDN: Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
