---
"@lyse-labs/lyse": patch
---

A `--scope` typo silently turned the CI gate off and exited 0.

`--scope new` on a repository with new drift exits 1. `--scope New`, same tree, same build, exits 0 — the value is compared with `===` against the lowercase literal at two separate sites, so anything else widened the audit to the whole tree and never reached `evaluateGate`. The gate was not passed; it was never run. A workflow that has stopped gating looks green.

`--format` had the same hole: an unrecognised value fell through to the JSON branch, so `--format=Sarif --output d` wrote `d/lyse.json` and exited 0.

Both now exit `64` and print the accepted values, matching what `--limit` and `--score-model` already did. `--scope New` adds *did you mean `new`?*. `lyse explain --format` is validated the same way.

Closes #276.
