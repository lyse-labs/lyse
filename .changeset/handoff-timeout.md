---
"@lyse-labs/lyse": patch
---

`lyse handoff` now bounds how long the agent it spawns may run.

`spawnAgentLauncher` resolved only when the child closed, and nothing else bounded it — so an agent that hangs (a prompt nobody answers, a network call with no deadline, a runaway loop) held the handoff open forever. Interactively that is visible and a human hits Ctrl-C. Unattended it is a silent stall on a process started with its permission prompts disabled, which is the one failure an overnight run cannot recover from on its own.

Default limit 30 minutes, overridable with `LYSE_HANDOFF_TIMEOUT_MS` (`0` waits indefinitely). Anything unparseable falls back to the default rather than to no timeout — a typo must not silently remove the only thing bounding an unattended run. A timeout sends `SIGTERM`, then `SIGKILL` after five seconds, records the reason in `.lyse/handoff/agent-transcript.log`, and exits `124` (the conventional `timeout(1)` status).

Edits the agent had already written to the working tree are deliberately left in place: this bounds the run, it does not roll it back, and the notice says so.
