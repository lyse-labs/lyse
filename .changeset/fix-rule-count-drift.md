---
"@lyse-labs/lyse": patch
---

Correct the rule/sub-axis counts across the docs, which had drifted to a stale "53 rules / 43 stable" (and a "12 rules across 5 axes" in the npm README) against a live registry of 65 rules / 65 sub-axes / 52 stable across 6 axes. Regenerated `docs/architecture/sub-axes.md` + `per-rule-slo.md` from the catalogue and fixed the hand-typed counts in the README, CLAUDE.md, `health-score.md`, `reliability.md`, and `overview.md`.
