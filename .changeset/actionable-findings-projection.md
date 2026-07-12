---
"@lyse-labs/lyse": minor
---

`lyse audit` now computes a deterministic score projection in `meta.projection`: findings are grouped by fix (`fixGroup.key`, or bare `ruleId` when ungrouped), and the top 3 groups by Health Score gain are ranked with their per-group gain, distinct file count, and a `migrationScale` flag for large-blast-radius groups. Advisory only — never changes the Health Score itself. New config knob `advisory.migrationScaleFileCount` (default 40) tunes the file-count threshold above which a group is flagged `migrationScale`. Currently only surfaced in `lyse.json` output; a terminal-report presentation lands in a follow-up.
