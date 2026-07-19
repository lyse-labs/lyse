---
"@lyse-labs/lyse": patch
---

fix: `schemas/v1/lyse-result.json` and `schemas/v3/lyse-result.json` now accept the `fixGroup` and `llmJudgement` fields a real finding can carry.

Both schemas set `findings.items.additionalProperties: false` and only listed 8 finding fields, but the real `Finding` type also carries an optional `fixGroup` (root-cause grouping) and `llmJudgement` (Layer 4 precision-filter verdict) — so `lyse audit --format json` routinely produced output that failed validation against the very `$schema` URL it stamps (141/223 findings dogfooding `packages/core`). Both schemas now model `fixGroup`/`llmJudgement` explicitly; `additionalProperties: false` is unchanged, so genuinely unknown fields still fail validation.
