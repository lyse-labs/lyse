---
"@lyse-labs/lyse": minor
---

feat: Health Score now uses the `scoring-v3` adoption-ratio model by default — breaking score change, previous scores are not comparable.

Each axis score is now an opportunity-weighted clean-adoption ratio (`Σ max(0, opportunities − findings) / Σ opportunities`, floored so a positive-adoption axis never rounds to 0) instead of the old severity-weighted penalty against a log-capped baseline. Axes need at least 30 opportunities to count (`scoring.minSampleSize`, configurable in `.lyse.yaml`) — below that they report `insufficient sample` and are excluded from the mean; if every axis falls short, `finalScore` is `N/A`. Severity no longer weights the score arithmetic (it still drives finding display order and CI-gate policy). Grade is now a pure band lookup — the ≥2-axes-at-0 auto-fail is gone.

**Previous `scoring-v1.x` scores are not comparable to `scoring-v3` scores.** The old formula stays reachable, byte-for-byte, for one minor release via `lyse audit --score-model v2` (or `LYSE_SCORE_MODEL=v2`, or `.lyse.yaml` `scoring.model: v2`) before it is removed.
