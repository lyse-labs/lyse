---
"@lyse-labs/lyse": minor
---

`lyse audit` now computes a deterministic score projection in `meta.projection`: findings are grouped by fix (`fixGroup.key`, or bare `ruleId` when ungrouped), and the top 3 groups by Health Score gain are ranked with their per-group gain, distinct file count, and a `migrationScale` flag for large-blast-radius groups. Advisory only — never changes the Health Score itself. New config knob `advisory.migrationScaleFileCount` (default 40) tunes the file-count threshold above which a group is flagged `migrationScale`.

The terminal report now surfaces this directly: the score card gains a line under the gauge (`↗ fix the top N drift groups → +M pts`, omitted when there's nothing to project), and the default-mode "Top findings" list groups findings by fix instead of listing them one by one — a `×N` count, "and N−1 more sites", and (when the fix has a single resolved candidate) a "one fix clears all N findings" line. Groups flagged `migrationScale` get a "sample before you sweep" advisory. `--verbose` and an explicit `--limit` keep the flat per-finding list unchanged.
