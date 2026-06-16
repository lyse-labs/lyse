# Lyse — Per-rule SLO

> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.

> Generated: deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)

This page lists every sub-axis currently promoted to `stable`, with the empirical precision / recall Wilson 95 % lower bound from the latest calibration run against [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench).

An empty table means no sub-axis has crossed the promotion gate yet. The reliability system seeds the catalogue dormant; sub-axes earn `stable` status by clearing the gate against real labeled data.

| Rule | Sub-axis | Precision (Wilson LB) | Recall (Wilson LB) | N samples | Last calibrated |
|---|---|---|---|---|---|
| `tokens/deprecated-token-usage` | `tokens.deprecated-token-usage` | 0.901 | 0.904 | — | 2026-06-15 |
| `tokens/dtcg-conformance` | `tokens.dtcg-conformance` | 0.901 | 0.901 | — | 2026-06-15 |
| `tokens/theme-modes-present` | `tokens.theme-modes` | 0.901 | 0.904 | — | 2026-06-15 |
| `ai-surface/agent-instruction-files` | `ai-surface.agent-instruction-files` | 0.901 | 0.901 | — | 2026-06-15 |
| `versioning/changelog-present` | `ai-surface.changelog-present` | 0.901 | 0.904 | — | 2026-06-15 |
| `ai-surface/component-manifest-json` | `ai-surface.component-manifest-json` | 0.901 | 0.901 | — | 2026-06-15 |
| `ai-surface/ds-index-exported` | `ai-surface.ds-index-exported` | 0.901 | 0.901 | — | 2026-06-15 |
| `ai-surface/llms-txt-structure` | `ai-surface.llms-txt-structure` | 0.901 | 0.901 | — | 2026-06-15 |
| `ai-surface/mcp-config-present` | `ai-surface.mcp-config-present` | 0.901 | 0.901 | — | 2026-06-15 |
| `versioning/migration-guide-present` | `ai-surface.migration-guide-present` | 0.901 | 0.904 | — | 2026-06-15 |
| `versioning/semver-versioning` | `ai-surface.semver-versioning` | 0.901 | 0.904 | — | 2026-06-15 |
| `ai-surface/shadcn-registry-valid` | `ai-surface.shadcn-registry-valid` | 0.901 | 0.904 | — | 2026-06-15 |
