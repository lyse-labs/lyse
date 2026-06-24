# `tokens/responsive-breakpoints`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Checks, at repo level, whether a design system that uses width-based `@media` queries also defines a tokenized breakpoint scale.

## Why

When breakpoints live as bare literals scattered across stylesheets — `600px` in one file, `640px` in another, `768px` in a third — the design system has no single source of truth for its responsive grid. Layouts break at inconsistent widths, and consumers can't reason about the system's breakpoints.

A tokenized scale — Tailwind `screens`, DTCG dimension tokens, SCSS `$breakpoint-*` variables, or a JS `breakpoints` theme object — makes the breakpoints explicit and shared.

## How

The check is **repo-level**:

1. **Responsive?** — scans CSS, SCSS, and extracted CSS-in-JS for a width-based `@media` query (`min-width` / `max-width` / `width`, including range syntax).
2. **Breakpoint scale present?** — looks for any of: loaded breakpoint tokens (`ctx.tokens.breakpoints` — Tailwind `screens`, DTCG, CSS vars); SCSS / CSS breakpoint variables (`$breakpoint-*`, `$bp-*`, `--bp-*`); or a JS/TS `breakpoints` / `screens` object.

If the system is responsive but no scale is found anywhere, the rule emits **one** warning at repo level. If a scale exists — or there are no width media queries — it emits nothing (the latter is N/A).

## Bad

```css
@media (min-width: 768px) { .grid { … } }
/* no breakpoint scale anywhere — 768 is a magic number */
```

## Good

```scss
$breakpoint-md: 768px;
@media (min-width: $breakpoint-md) { .grid { … } }
```

## Scope

The **per-occurrence** detection of hardcoded media-query values (flagging each `768px` literal) overlaps the hardcoded-value rule family and is intentionally **not** done here — this rule is a single repo-level presence check.

## Allowlist

```
lyse-disable tokens/responsive-breakpoints
```

## What does NOT trigger this rule

- A repo with any breakpoint-scale signal (tokens, SCSS vars, JS object).
- A design system with no width media queries (N/A).

## Status

Stable and **scored**: it contributes to the Health Score.

## See also

- [MDN: Using media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries/Using_media_queries)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
