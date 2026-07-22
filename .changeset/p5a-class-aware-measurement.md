---
"@lyse-labs/lyse": patch
---

Class-aware measurement machinery + `rules-precision` ledger (P5a). This is measurement **infrastructure only** — no Health Score change, no `contributesToScore` or rule-status change, audit numbers are unchanged, and there is no new CLI/MCP surface. The 66-rule set, the frozen scorer, `sub-axes.ts`, `coverage.ts`, and `rules-manifest.json` are byte-identical, and the synthetic engine gate still passes.

What lands: an independent, deterministic `exact`-class verifier that re-derives ground truth from the repo's own token graph without trusting the rule or its confidence; per-`(ruleId, class, zone)` bucketing; a `rules-precision` ledger builder/serializer with a computed `gateEligible` flag (`auto`-provenance ∧ N ≥ 35 ∧ Wilson-95% LB ≥ 0.90, never hand-set); and honest report / per-rule-doc rendering (`measured` / `candidate` / `not measured`, where a candidate line never claims a measured or gate-eligible number). Only the deterministic `exact` bucket is gate-eligible — that is **necessary but not sufficient** for a future score promotion, which also requires a recall gate not measured here.

Deferred (a separate follow-up, run where the drift-rich corpus + measurement orchestration live): the real corpus measurement run, the committed root ledger artifact, and the generated per-rule doc sections. The example ledger shipped here is a clearly-labelled test fixture — no real precision numbers are published in this change.
