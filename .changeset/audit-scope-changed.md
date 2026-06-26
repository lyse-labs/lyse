---
"@lyse-labs/lyse": minor
---

`lyse audit --scope changed|staged` (+ `--staged` shortcut, `--base <ref>`): limit the audit and its findings to git-changed files — `changed` (files changed vs `--base`, default `origin/main`) or `staged` (files in the index). This is the building block for finding-level PR review (flag only the drift a change introduces, not the whole backlog) and for pre-commit hooks. Whole-tree audit remains the default. A clear error (exit 64) is raised when the base ref can't be resolved or there's no git repo.
