---
"@lyse-labs/lyse": patch
---

Remove stale "experimental — does not contribute to the Health Score" claims from 19 rules that are in fact stable and scored. The claim was baked into the published `rules-manifest.json` (via each rule's `rationale`) and repeated in 11 `docs/rules/*.md` files, so the npm artifact and docs told users these rules were reported-only when they actually contribute to the score. The 13 genuinely-experimental rules (e.g. `tokens/no-hardcoded-shadow`, `tokens/no-hardcoded-gradient`, `a11y/runtime-axe`, the unscored ai-governance affordances) keep their experimental wording. Source of truth: each sub-axis's `contributesToScore` flag in the reliability catalogue.
