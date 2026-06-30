---
"@lyse-labs/lyse": patch
---

Reliability numbers are now derived in-repo from adversarial fixtures with a real sample count (N); the per-rule SLO table shows N. `tokens/no-hardcoded-color`, `tokens/no-hardcoded-shadow`, and `components/contracts-strictness` gained honest in-repo measurements; all remain experimental and do not contribute to the Health Score. SARIF output now emits the conservative Wilson lower bound on precision (not the flattering point estimate) and omits precision entirely for sub-axes with N = 0.
