# `a11y/prefers-reduced-motion`

> **Axis:** A11y · **Severity:** warning · **Auto-fixable:** no · **Status:** stable (scored)

Checks, at repo level, whether a design system that uses CSS motion (transitions, animations, or `@keyframes`) also honors the user's `prefers-reduced-motion` setting.

## Why

Vestibular and motion-sensitivity disorders make large or fast animations actively harmful — they can trigger nausea, dizziness, and migraines. The [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) media feature lets users opt out of motion at the OS level.

A design system is a force multiplier: if it animates without honoring that signal, *every* product built on it inherits the gap. A single guard, anywhere in the system, is enough to clear the check.

## How

The check is **repo-level** and runs in two passes:

1. **Motion present?** — scans CSS files and extracted CSS-in-JS for a real `transition` / `animation` declaration (a value other than `none` / `0s` / `unset` / …) or an `@keyframes` block. Motion is **not** inferred from TS/JSX, so a framer-motion `transition` prop does not falsely trip the rule.
2. **Guard present?** — scans CSS, CSS-in-JS, **and** TS/JS for the string `prefers-reduced-motion` (a `@media (prefers-reduced-motion: …)` block or a `matchMedia('(prefers-reduced-motion: …)')` call).

If motion is present but no guard is found anywhere, the rule emits **one** warning at repo level. If a guard exists — or the system uses no motion at all — it emits nothing (the latter is N/A, not a pass).

## Bad

```css
.btn { transition: transform 0.2s ease; }
/* no prefers-reduced-motion handling anywhere in the system */
```

## Good

```css
.btn { transition: transform 0.2s ease; }

@media (prefers-reduced-motion: reduce) {
  .btn { transition: none; }
}
```

Or, in JS:

```ts
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

## Allowlist

Add to a `README` to mark the rule N/A for the repo:

```
lyse-disable a11y/prefers-reduced-motion
```

## What does NOT trigger this rule

- A `transition` / `animate` prop on a framer-motion (or similar) component — motion is only counted from CSS sources.
- `transition: none` / `animation: none` — explicit no-ops.
- A design system with no motion at all (N/A).

## Status

Stable and **scored**: it contributes to the Health Score.

## See also

- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [WCAG 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
