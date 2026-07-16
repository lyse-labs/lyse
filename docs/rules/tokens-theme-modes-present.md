# `tokens/theme-modes-present`

> **Axis:** Tokens · **Severity:** warning · **Auto-fixable:** no · **Version:** v1

Checks that the design system defines light/dark theme modes.

## Why

Design systems without explicit theme-mode declarations leave consumers to implement their own ad-hoc dark-mode strategies, leading to inconsistent behaviour across products. A repo-level signal — however simple — proves the design system has taken a position on color-scheme support.

## How it works

The check is intentionally broad: **any one** of these five signals counts as "present", and the rule emits nothing:

1. A `prefers-color-scheme` media query in CSS/SCSS.
2. A `[data-theme]`, `[data-mode]`, or `[data-color-mode]` attribute selector.
3. A `.dark` / `.light` class convention.
4. A DTCG/token JSON file with a `dark` or `light` group, or an `$extensions` mode split.
5. A Tailwind v4 `@variant dark` / `dark:` usage indicator.

When none is found, the rule emits **one warning at repo level**.

## Bad

```css
:root { --color-bg: #fff; }
/* no color-scheme awareness anywhere in the repo */
```

## Good

```css
:root { --color-bg: #fff; }
[data-theme="dark"] { --color-bg: #111; }
```

or

```css
@media (prefers-color-scheme: dark) {
  :root { --color-bg: #111; }
}
```

## Allowlist

- Repos containing `lyse-disable tokens/theme-modes-present` in a README — the rule is N/A.
- Token files larger than 1 MB are skipped to avoid pathological cases.

## See also

- [Health Score](../guide/health-score.md) — how rules combine into the final score.
