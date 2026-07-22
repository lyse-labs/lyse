---
"@lyse-labs/lyse": minor
---

Diff-first engine (P4): `lyse baseline write` + `lyse audit --scope new`. Recurring
audits report/gate only findings absent from a committed `.lyse/baseline.json`.
Reformat-only commits produce zero new findings. CI gate simplified to a single
self-gating `audit --scope new` step; SARIF fingerprints are now reformat-proof.
