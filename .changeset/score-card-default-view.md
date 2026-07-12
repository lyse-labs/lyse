---
"@lyse-labs/lyse": minor
---

The default `lyse audit` terminal report now opens with a bordered score card — score, grade, delta since the last audit, and a bar for every scored axis (tokens, a11y, components, stories, ai-surface, ai-governance) inside one screenshotable box. Machine formats (`--format json`/`sarif`) are untouched, and no score, rule, or scoring logic changed — this is a rendering-only change.
