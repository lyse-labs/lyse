---
"@lyse-labs/lyse": minor
---

`lyse handoff` gains a safety mode. By default it still launches your coding agent with permission prompts bypassed (unattended, working-tree-only edits) — but it now prints a one-line warning and asks `Continue? [y/N]` before spawning; the prompt is skipped (and the run proceeds) on a non-interactive shell or with `--yes`. The new `--review` flag (also `LYSE_HANDOFF_REVIEW=1` env, or `.lyse.yaml` `handoff.review: true`) launches the agent under its own default permission model instead — it prompts you per-action — and skips the confirmation since the agent's own prompts are the safety net in that mode. Also fixes `lyse handoff --yes` incorrectly bailing out with "needs an interactive terminal" before doing anything.
