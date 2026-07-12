---
"@lyse-labs/lyse": minor
---

First-run friction removed: `lyse audit` no longer asks anything before showing your score. The telemetry consent prompt is now the LAST interactive act of the run — after the report, the action menu, and every telemetry emit site — so the ADR-0012 guarantee (the run that asks never emits) holds by construction. Same max-two-lifetime-prompts policy; skipped under `--quiet`, `--yes`, `--no-prompt`, machine formats, and non-TTY. The LLM precision-filter prompt is removed entirely (its interactive consent path was dead code once the audit path stopped calling it) — enable the filter with `--llm` (single run) or `LYSE_LLM=1` (persisted); a record persisted by a previously accepted prompt stays honored. Env overrides, persisted decisions, and CI behavior are unchanged.
