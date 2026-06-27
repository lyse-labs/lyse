---
"@lyse-labs/lyse": patch
---

Fix `lyse init` hanging after stack detection: the framework-detection spinner
kept redrawing over the interactive "Proceed?" prompt, burying it forever on a
TTY (#205). `runInit` now runs without the competing CLI spinner. Also stamp the
real Lyse version in the generated `.lyse.yaml` header instead of a hardcoded
`0.1.0` (#204).
