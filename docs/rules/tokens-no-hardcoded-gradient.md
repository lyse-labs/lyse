# `tokens/no-hardcoded-gradient`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only — demoted after corpus validation)

Flags inline CSS gradient functions used as property values, instead of a tokenized gradient.

## Why

A brand gradient is a system decision — a named token (`--gradient-brand`, `--gradient-scrim`) keeps it consistent and themeable. Inline `linear-gradient(...)` literals scattered across components drift into a dozen near-identical-but-not sheens and can't be re-themed in one place. The good case is to define the gradient once as a token and reference it.

## How

Scans CSS and extracted CSS-in-JS for gradient functions — `linear-gradient`, `radial-gradient`, `conic-gradient`, and their `repeating-` variants — used as a value. Each inline literal is flagged. The gradient is treated as **one unit** (a composite token); the raw colors inside it are the [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md) rule's concern.

## Bad

```css
.hero { background: linear-gradient(90deg, #f00, #00f); }
```

## Good

```css
:root { --gradient-brand: linear-gradient(90deg, #f00, #00f); }
.hero { background: var(--gradient-brand); }
```

## What does NOT trigger this rule

- A gradient defined **on** a CSS custom property (`--gradient-brand: linear-gradient(…)`) — that is the token definition.
- A `var(--gradient-*)` reference — no inline literal is present.
- Gradients inside comments or URLs.

## Allowlist

```
lyse-disable tokens/no-hardcoded-gradient
```

## Status

**Experimental (reported-only).** Promoted 2026-06-20 then **demoted** after corpus precision-validation on 5 real DS surfaced precision/value issues (see internal report) — reported but not scored.

## See also

- [`tokens/no-hardcoded-color`](./tokens-no-hardcoded-color.md) · [`tokens/no-hardcoded-shadow`](./tokens-no-hardcoded-shadow.md) — sibling composite-value rules.
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
