---
"@lyse-labs/lyse": minor
---

Terminal UI: the `lyse init` wizard now uses an interactive @clack/prompts flow (intro/outro, grouped confirmations, task spinners). Non-interactive and CI runs are unchanged — prompts are bypassed and output stays plain text.
