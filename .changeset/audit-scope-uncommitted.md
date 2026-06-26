---
"@lyse-labs/lyse": minor
---

`lyse audit --scope uncommitted`: audit only the files changed in the working tree but not yet committed (tracked modifications vs HEAD + untracked files). This completes the `--scope` family (`changed` = committed-vs-base, `staged` = index, `uncommitted` = working tree) and is the right scope for verifying a coding agent's edits — which live in the working tree, uncommitted — so the `lyse handoff` skill now suggests `lyse audit --scope uncommitted` for a fast check of just the agent's fixes.
