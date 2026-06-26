---
"@lyse-labs/lyse": minor
---

`lyse add git-hook`: install a pre-commit hook that surfaces design-system drift in *staged* files (`lyse audit --staged`) before each commit. Advisory by design — it never blocks the commit (bypass with `git commit --no-verify`) and never clobbers a pre-existing hook without `--force`. Plus: the `lyse add ci-gate` workflow now includes an advisory step that reports the new drift a PR introduces on its changed files (`--scope changed`), complementing the score-regression gate.
