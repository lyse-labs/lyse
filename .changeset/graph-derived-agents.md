---
"@lyse-labs/lyse": minor
---

`lyse agents` now generates AGENTS.md from the graph-derived DS Machine Manifest instead of a static template: real token ids and values grouped by axis, component contracts with props and variants, extraction-degradation warnings, and a `token_set_hash` staleness marker. Same command and flags; materially richer generated content. Each component contract's `file` field is always `null` for now — no extractor yet resolves a real source path at this layer.
