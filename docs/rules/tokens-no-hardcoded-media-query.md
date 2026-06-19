# `tokens/no-hardcoded-media-query`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Flags raw `px` / `rem` / `em` literals used as breakpoint values inside `@media` width/height features, when they are not on the tokenized breakpoint scale.

## Why

A design system's breakpoints are a shared vocabulary. When media queries hardcode `768px` in one component and `760px` in another, layouts break at inconsistent widths and there is no single source of truth for the responsive grid. Referencing a tokenized breakpoint scale keeps every component snapping to the same widths.

This is the **per-occurrence** complement to [`tokens/responsive-breakpoints`](./tokens-responsive-breakpoints.md), which only checks at repo level whether a breakpoint scale exists at all.

## How

1. Extracts every `@media` prelude (the text up to the opening `{`) from CSS, SCSS, and extracted CSS-in-JS.
2. Within each prelude, finds raw numeric literals in width/height features — both colon syntax (`min-width: 768px`, `max-height: 40rem`) and range syntax (`width >= 600px`).
3. Emits a warning for each literal that is **not** on the breakpoint scale.

A tokenized breakpoint — SCSS `$breakpoint-*` interpolation, a custom property, or a JS `breakpoints` map — produces no raw numeric literal, so it never fires.

## Bad

```css
@media (min-width: 768px) { .grid { display: grid; } }
```

## Good

```scss
$breakpoint-md: 768px;
@media (min-width: $breakpoint-md) { .grid { display: grid; } }
```

## Allowlist

```
lyse-disable tokens/no-hardcoded-media-query
```

## What does NOT trigger this rule

- `min-width: 0` and other zero resets.
- A literal whose value matches a defined breakpoint token (treated as on-scale / consistent).
- A SCSS variable, custom property, or JS breakpoint reference (no raw literal).
- A `max-width:` sizing property in a normal rule body — that is a layout property, not a media-query breakpoint, and is the [`tokens/no-hardcoded-spacing`](./tokens-no-hardcoded-spacing.md) rule's territory.
- A media query that lives inside a comment.

## Status

Experimental and **reported-only**: it does not contribute to the Health Score until calibration data is available.

## See also

- [`tokens/responsive-breakpoints`](./tokens-responsive-breakpoints.md) — the repo-level presence check.
- [MDN: Using media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
