# Lyse — Sub-axes coverage

> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.

> Generated: deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)

**13 sub-axes total** — stable: 0 · experimental: 13 · disabled: 0

Only sub-axes with `status: stable` contribute to the Health Score by default. Promotion gate: N ≥ 30 labeled samples AND Wilson 95 % lower bound ≥ 0.90 on recall. See [`docs/architecture/reliability.md`](./reliability.md) for methodology.

| ID | Axis | Name | Status | Precision (LB) | Recall (LB) | In Score |
|---|---|---|---|---|---|---|
| `tokens.color` | `tokens` | Color tokens | **experimental** | — | — | — |
| `tokens.description-coverage` | `tokens` | Token description coverage | **experimental** | — | — | — |
| `tokens.dtcg-conformance` | `tokens` | DTCG conformance | **experimental** | — | — | — |
| `tokens.spacing` | `tokens` | Spacing tokens | **experimental** | — | — | — |
| `a11y.essentials` | `a11y` | jsx-a11y essentials | **experimental** | — | — | — |
| `components.contracts-strictness` | `components` | Component prop contract strictness | **experimental** | — | — | — |
| `components.naming-component-pascalcase` | `components` | Component PascalCase | **experimental** | — | — | — |
| `components.naming-hook-prefix` | `components` | Hook `use` prefix | **experimental** | — | — | — |
| `components.native-shadows` | `components` | Native shadow elements | **experimental** | — | — | — |
| `stories.coverage` | `stories` | Storybook coverage | **experimental** | — | — | — |
| `ai-surface.agents-md-quality` | `ai-surface` | AGENTS.md quality | **experimental** | — | — | — |
| `ai-surface.component-manifest-json` | `ai-surface` | Component manifest JSON | **experimental** | — | — | — |
| `ai-surface.ds-index-exported` | `ai-surface` | DS index export | **experimental** | — | — | — |
