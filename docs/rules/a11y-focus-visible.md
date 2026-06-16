# `a11y/focus-visible`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Status:** experimental (reported-only, not yet scored)

Checks, at repo level, whether a design system that removes the focus outline (`outline: none` / `outline: 0`) also adopts `:focus-visible`.

## Why

A visible focus indicator is how keyboard and switch users know where they are. Blanket `outline: none` resets — extremely common in design-system base styles — silently delete that indicator for every product downstream.

[`:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible) is the modern fix: the browser shows a focus ring for keyboard interaction but not for mouse clicks, so you can remove the default outline for pointer users without harming keyboard users.

## How

The check is **repo-level**:

1. **Outline suppressed?** — scans CSS + extracted CSS-in-JS for `outline: none` / `outline: 0` / `outline-width: 0`.
2. **`:focus-visible` adopted?** — scans CSS, CSS-in-JS, **and** TS/JS for any `focus-visible` signal: the `:focus-visible` pseudo-class, or the [`focus-visible` polyfill](https://github.com/WICG/focus-visible) (npm import, `.js-focus-visible` class, `[data-focus-visible-added]`).

If an outline is removed but no `:focus-visible` adoption is found anywhere, the rule emits **one** warning at repo level. If `:focus-visible` is adopted — or no outline is suppressed — it emits nothing (the latter is N/A).

The canonical modern pattern is **correct** and clears the check (because `:focus-visible` is present):

```css
button:focus:not(:focus-visible) { outline: none; }
button:focus-visible { outline: 2px solid; }
```

## Bad

```css
button:focus { outline: none; }
/* no :focus-visible anywhere — keyboard users lose the ring */
```

## Good

```css
button:focus-visible { outline: 2px solid var(--focus-ring); }
```

## Allowlist

Add to a `README` to mark the rule N/A for the repo:

```
lyse-disable a11y/focus-visible
```

## What does NOT trigger this rule

- A repo that uses `:focus-visible` (or the polyfill) anywhere.
- A design system that never removes the focus outline (N/A).

## Status

Experimental and **reported-only**: it does not contribute to the Health Score until calibration data is available.

## See also

- [MDN: `:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)
- [WICG `focus-visible` polyfill](https://github.com/WICG/focus-visible)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
