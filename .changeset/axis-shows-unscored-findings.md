---
"@lyse-labs/lyse": patch
---

An axis no longer prints a bare perfect score next to its own findings. `AxisScore` gains `unscoredFindings` — findings reported on that axis that the score deliberately ignores (experimental sub-axes, rules silenced by degraded extraction) — and the score card renders it as `+N` after the bar, so `a11y 100` can no longer appear above a list of fifteen accessibility findings without qualification.
