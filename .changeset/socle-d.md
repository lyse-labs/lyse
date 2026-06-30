---
"@lyse-labs/lyse": minor
---

Retired 7 experimental, off-score ai-governance rules (sub-project D).

Removed `ai-governance/explainability-affordance`, `human-control-affordances`, `ai-marker-anti-patterns`, `disclaimer-present`, `value-gate-doc-present`, `ai-tokens-reserved`, and `ai-token-requires-marker` — all experimental, unmeasured, and never part of the Health Score, so scores are unaffected (`scoring-v1.1` unchanged). The ai-governance axis now reflects its 11 deterministic, validated rules (registry 73 → 66). A `.lyse.yaml` referencing a retired id is tolerated with a warning instead of a hard error. The `ai-token-requires-marker` codemod, the value-gate `lyse init` scaffold, and the 5 corresponding LLM precision-filter rubric dimensions were removed with the rules.
