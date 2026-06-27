---
"@lyse-labs/lyse": minor
---

One door for fixing: `lyse handoff`. Lyse no longer edits your code itself — the deterministic-codemod command `lyse fix` is retired and now prints a notice and redirects to `lyse handoff`, which hands the findings (grouped by drift class, with the resolved token mapping + full token map) to the coding agent you already use. The post-audit menu and the interactive REPL now offer "Hand off to your agent" instead of "Auto-fix". `lyse fix`'s two non-fix extras moved to the setup wizard: `lyse init --scaffold` (generate missing AI-readiness files) and `lyse init --migrate-tokens` (convert legacy `{ value, type }` token JSON to DTCG). The codemod engine (`rule.applyCodemod`) stays — it still powers MCP `suggest_fix` and the handoff payload. **Breaking:** `lyse fix --dry-run/--confidence/--rule/--force-on-dirty/--verify-with-tests` are gone; use `lyse handoff` (your agent reviews and edits the working tree, never commits).
