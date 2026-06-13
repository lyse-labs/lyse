# Lyse — Sub-axes coverage

> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.

> Generated: deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)

**28 sub-axes total** — stable: 5 · experimental: 23 · disabled: 0

Only sub-axes with `status: stable` contribute to the Health Score by default. Promotion gate: N ≥ 30 labeled samples AND Wilson 95 % lower bound ≥ 0.90 on recall. See [`docs/architecture/reliability.md`](./reliability.md) for methodology.

| ID | Axis | Name | Status | Precision (LB) | Recall (LB) | In Score |
|---|---|---|---|---|---|---|
| `tokens.color` | `tokens` | Color tokens | **experimental** | 0.339 | 0.904 | — |
| `tokens.description-coverage` | `tokens` | Token description coverage | **experimental** | — | 0.901 | — |
| `tokens.dtcg-conformance` | `tokens` | DTCG conformance | **stable** | 0.901 | 0.901 | ✅ |
| `tokens.spacing` | `tokens` | Spacing tokens | **experimental** | 0.163 | 0.904 | — |
| `a11y.essentials` | `a11y` | jsx-a11y essentials | **experimental** | — | 0.904 | — |
| `components.contracts-strictness` | `components` | Component prop contract strictness | **experimental** | — | — | — |
| `components.naming-component-pascalcase` | `components` | Component PascalCase | **experimental** | — | 0.904 | — |
| `components.naming-hook-prefix` | `components` | Hook `use` prefix | **experimental** | — | 0.904 | — |
| `components.native-shadows` | `components` | Native shadow elements | **experimental** | — | 0.901 | — |
| `stories.coverage` | `stories` | Storybook coverage | **experimental** | — | 0.901 | — |
| `ai-surface.agent-instruction-files` | `ai-surface` | Agent instruction files (Cursor / Claude) | **experimental** | — | 0.901 | — |
| `ai-surface.agents-md-quality` | `ai-surface` | AGENTS.md quality | **experimental** | — | 0.901 | — |
| `ai-surface.component-manifest-json` | `ai-surface` | Component manifest JSON | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.ds-index-exported` | `ai-surface` | DS index export | **experimental** | — | 0.901 | — |
| `ai-surface.llms-txt-structure` | `ai-surface` | llms.txt structure | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.mcp-config-present` | `ai-surface` | MCP config present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.shadcn-registry-valid` | `ai-surface` | shadcn registry validity | **stable** | 0.901 | 0.904 | ✅ |
| `ai-governance.ai-content-live-region` | `ai-governance` | AI content live region | **experimental** | — | 0.901 | — |
| `ai-governance.ai-loading-error-states` | `ai-governance` | AI loading state & error state | **experimental** | — | 0.901 | — |
| `ai-governance.ai-marker-anti-patterns` | `ai-governance` | AI-marker anti-patterns | **experimental** | — | 0.901 | — |
| `ai-governance.ai-marker-component-present` | `ai-governance` | AI-marker component present | **experimental** | — | 0.901 | — |
| `ai-governance.ai-token-requires-marker` | `ai-governance` | AI token requires co-located marker | **experimental** | — | 0.901 | — |
| `ai-governance.ai-tokens-reserved` | `ai-governance` | Reserved AI-marker tokens inventory | **experimental** | — | 0.901 | — |
| `ai-governance.disclaimer-present` | `ai-governance` | AI disclaimer present | **experimental** | — | 0.901 | — |
| `ai-governance.explainability-affordance` | `ai-governance` | Explainability affordance | **experimental** | — | 0.901 | — |
| `ai-governance.feedback-control-present` | `ai-governance` | AI feedback control present | **experimental** | — | 0.901 | — |
| `ai-governance.human-control-affordances` | `ai-governance` | Human-control affordances | **experimental** | — | 0.901 | — |
| `ai-governance.value-gate-doc-present` | `ai-governance` | AI value-gate governance doc | **experimental** | — | 0.901 | — |
