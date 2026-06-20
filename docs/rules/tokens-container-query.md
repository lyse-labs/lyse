# `tokens/container-query`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** scored (v1)

Checks that CSS `@container` queries actually have a containment context to match against.

## Why

Container queries let a component respond to the size of its container rather than the viewport — the right primitive for a reusable design system. But an `@container` rule only works if some ancestor establishes a containment context with `container-type` (or the `container` shorthand). Without it, the query silently never matches and the responsive behavior is dead code — a subtle bug that ships unnoticed.

This rule is **non-prescriptive**: not using container queries at all is fine (N/A). It only checks that the ones present are wired correctly.

## How

The check is **repo-level**:

1. **Uses container queries?** — scans CSS, SCSS, and extracted CSS-in-JS for an `@container` query.
2. **Declares a context?** — looks for a `container-type`, `container-name`, or `container:` shorthand declaration anywhere.

If `@container` is used but no context is declared anywhere, the rule emits **one** warning. If a context exists — or no container queries are used — it emits nothing (the latter is N/A).

## Bad

```css
@container (min-width: 400px) { .card { display: grid; } }
/* no container-type anywhere — this query never matches */
```

## Good

```css
.card-wrap { container-type: inline-size; }
@container (min-width: 400px) { .card { display: grid; } }
```

## What does NOT trigger this rule

- A repo with any `container-type` / `container-name` / `container:` declaration.
- A design system that uses no `@container` queries (N/A) — not using them is not a finding.
- A `container-type` mentioned only in a comment does not count as a real context.

## Allowlist

```
lyse-disable tokens/container-query
```

## Status

**Scored (v1):** contributes to the Health Score. Promoted 2026-06-20 after clearing both gates on the synthetic recall suite (recall LB 0.901, precision LB 0.912).

## See also

- `tokens/responsive-breakpoints` · `tokens/no-hardcoded-media-query` — the other F. Responsive checks.
- [MDN: CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
