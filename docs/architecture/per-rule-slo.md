# Lyse — Per-rule SLO

> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.

> Generated: deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)

This page lists every sub-axis currently promoted to `stable`, with the empirical precision / recall Wilson 95 % lower bound from the latest calibration run against [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench).

An empty table means no sub-axis has crossed the promotion gate yet. The reliability system seeds the catalogue dormant; sub-axes earn `stable` status by clearing the gate against real labeled data.

| Rule | Sub-axis | Precision (Wilson LB) | Recall (Wilson LB) | N samples | Last calibrated |
|---|---|---|---|---|---|
| `tokens/dtcg-conformance` | `tokens.dtcg-conformance` | 0.901 | 0.901 | — | 2026-06-13 |
| `ai-surface/component-manifest-json` | `ai-surface.component-manifest-json` | 0.901 | 0.901 | — | 2026-06-13 |
| `ai-surface/llms-txt-structure` | `ai-surface.llms-txt-structure` | 0.901 | 0.901 | — | 2026-06-13 |
| `ai-surface/mcp-config-present` | `ai-surface.mcp-config-present` | 0.901 | 0.901 | — | 2026-06-13 |
| `ai-surface/shadcn-registry-valid` | `ai-surface.shadcn-registry-valid` | 0.901 | 0.904 | — | 2026-06-13 |
