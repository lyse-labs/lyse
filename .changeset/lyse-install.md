---
"@lyse-labs/lyse": minor
---

`lyse install`: one-command onboarding. Installs the Lyse skill into every detected coding agent (Claude Code, Cursor, Codex, OpenCode) and the advisory pre-commit hook, so a single `npx @lyse-labs/lyse install` wires Lyse into a repo. Reuses the existing agent-detection, skill-install, and git-hook primitives; resilient outside a git repo (skill still installs, hook reported as skipped).
