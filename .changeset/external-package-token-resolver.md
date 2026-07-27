---
"@lyse-labs/lyse": minor
---

Resolve design tokens from an installed external DS package. Set
`designSystem.tokenPackages` in `.lyse.yaml` (e.g. `["@primer/primitives"]`) and
Lyse reads that package's shipped colour tokens from `node_modules` (CSS
custom-property + JSON, colours only in v1, local-first / zero-network). A
hardcoded colour that matches an external token is now reported as high-confidence
drift with a suggested fix instead of an unknown value. **Opt-in:** with no
`tokenPackages` configured, audit output is unchanged. **Score note:** enabling it
re-classifies matching colours (novel→exact) and can move the colour-axis score.
