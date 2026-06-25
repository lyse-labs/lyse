---
"@lyse-labs/lyse": minor
---

Add `lyse handoff`: audit a project, then hand the findings to your installed coding agent (Claude Code, Cursor, Codex) to fix — Lyse never edits code itself. Findings are grouped by **drift-class** with the resolved design token (e.g. `#3b82f6 → color.brand.primary`, applied consistently across all sites), and the project's TokenMap is serialized into the handoff. Findings now carry an optional structured `fixGroup`. Non-interactive contexts skip the prompt; the agent spawn is opt-in via the menu.
