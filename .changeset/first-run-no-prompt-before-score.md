---
"@lyse-labs/lyse": minor
---

First-run friction removed: `lyse audit` no longer asks anything before showing your score. The telemetry consent prompt now appears AFTER the report is rendered (same max-two-lifetime-prompts policy, same ADR-0012 guarantee that the run which asks never emits), and it is skipped under `--quiet`, `--yes`, `--no-prompt`, machine formats, and non-TTY. The LLM precision-filter prompt leaves the default audit path entirely — enable it with `--llm` (single run) or `LYSE_LLM=1` (persisted); a previously accepted prompt stays honored. Env overrides, persisted decisions, and CI behavior are unchanged.
