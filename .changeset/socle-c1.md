---
"@lyse-labs/lyse": minor
---

New experimental socle rule (C1 sub-project) — the first static contrast check.

`a11y/contrast-tokens` flags a CSS rule / CSS-in-JS object / inline `style` that declares BOTH a foreground (`color`) AND a solid background where the resolved **literal** colors fall below WCAG AA contrast (4.5:1 normal text, 3:1 large text). It resolves only literal colors and skips anything it can't resolve to two opaque concrete values — `var()` token references (no forward token map is available in the rule context), alpha, `transparent`/`currentColor`/`inherit`, gradients/images, and single-property rules — so it never guesses a verdict. Orthogonal to `tokens/no-hardcoded-color` (the value) and `a11y/runtime-axe` (render-only). `contributesToScore: false` — no Health Score change; ships unmeasured (real-world precision pending a harvest measurement). Adds a pure WCAG contrast util (`src/a11y/contrast.ts`).
