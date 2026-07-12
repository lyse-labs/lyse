---
"@lyse-labs/lyse": minor
---

Bare `lyse` (no subcommand) on a TTY now runs the audit of the current directory instantly — react-doctor-style, the first command IS the product — instead of opening an interactive menu. It forwards `--yes`, `--no-prompt`, `--quiet`, and `--no-color` when present, and behaves exactly like `lyse audit` (same post-audit action menu, same exit codes). Non-TTY bare `lyse` is unchanged: it still prints usage.

**Retired:** the standalone REPL menu, and the `--no-menu` flag / `LYSE_NO_MENU` env var that used to skip it. The post-audit action menu already covers interactive follow-ups (handoff, MCP setup), so the separate menu was redundant. Migration: scripts and CI should already call `lyse audit` explicitly and are unaffected; anyone relying on the old bare-`lyse` menu (or `--no-menu`/`LYSE_NO_MENU` to suppress it) should switch to running `lyse audit` or the specific subcommand directly.
