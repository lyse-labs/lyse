---
"@lyse-labs/lyse": patch
---

Health Score integrity: the scorer now honours the reliability catalogue, abstains on axes whose extractor degraded, and refuses to publish a headline score computed from fewer than three axes.

Three defects, all in how the published number was derived:

- `scoreV3` was handed every finding, so rules marked `contributesToScore: false` moved the score — while `lyse explain --score` listed those same rules as "not counted" in the same run. Both sides of the adoption ratio are now filtered to score-contributing rules.
- An axis published a score even when `meta.extraction` reported its extractor as `degraded` (tokens read 99/100 on a repo with 0 token sources). Such an axis now returns `N/A`.
- The final score was a mean over however many axes happened to activate, with no floor — one repo published `100 / grade A` from a single axis. Three scored axes are now required; below that the run abstains and only per-axis numbers are published.

Scores move on real repositories. Repos that cannot be measured now say so instead of guessing.
