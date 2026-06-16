# Lyse — Sub-axes coverage

> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.

> Generated: deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)

**43 sub-axes total** — stable: 12 · experimental: 31 · disabled: 0

Only sub-axes with `status: stable` contribute to the Health Score by default. Promotion gate: N ≥ 30 labeled samples AND Wilson 95 % lower bound ≥ 0.90 on recall. See [`docs/architecture/reliability.md`](./reliability.md) for methodology.

| ID | Axis | Name | Status | Precision (LB) | Recall (LB) | In Score |
|---|---|---|---|---|---|---|
| `tokens.border-radius` | `tokens` | Radii token scale | **experimental** | — | — | — |
| `tokens.border-width` | `tokens` | Border-width token scale | **experimental** | — | — | — |
| `tokens.color` | `tokens` | Color tokens | **experimental** | 0.339 | 0.904 | — |
| `tokens.deprecated-token-usage` | `tokens` | Deprecated-token aliasing ($deprecated) | **stable** | 0.901 | 0.904 | ✅ |
| `tokens.description-coverage` | `tokens` | Token description coverage | **experimental** | — | 0.901 | — |
| `tokens.dtcg-conformance` | `tokens` | DTCG conformance | **stable** | 0.901 | 0.901 | ✅ |
| `tokens.motion` | `tokens` | Motion token scale (duration/easing) | **experimental** | — | — | — |
| `tokens.opacity` | `tokens` | Opacity token scale | **experimental** | — | — | — |
| `tokens.responsive-breakpoints` | `tokens` | Responsive breakpoint scale | **experimental** | — | — | — |
| `tokens.spacing` | `tokens` | Spacing tokens | **experimental** | 0.163 | 0.904 | — |
| `tokens.theme-modes` | `tokens` | Theme modes (light/dark) | **stable** | 0.901 | 0.904 | ✅ |
| `tokens.z-index` | `tokens` | Z-index token scale | **experimental** | — | — | — |
| `a11y.essentials` | `a11y` | jsx-a11y essentials | **experimental** | — | 0.904 | — |
| `a11y.focus-visible` | `a11y` | focus-visible adoption | **experimental** | — | — | — |
| `a11y.inclusive-language` | `a11y` | Inclusive language | **experimental** | — | — | — |
| `a11y.prefers-reduced-motion` | `a11y` | prefers-reduced-motion compliance | **experimental** | — | — | — |
| `components.contracts-strictness` | `components` | Component prop contract strictness | **experimental** | — | — | — |
| `components.naming-component-pascalcase` | `components` | Component PascalCase | **experimental** | — | 0.904 | — |
| `components.naming-hook-prefix` | `components` | Hook `use` prefix | **experimental** | — | 0.904 | — |
| `components.native-shadows` | `components` | Native shadow elements | **experimental** | — | 0.901 | — |
| `components.no-icon-fonts` | `components` | Icon delivery (SVG over icon-font) | **experimental** | — | — | — |
| `stories.coverage` | `stories` | Storybook coverage | **experimental** | — | 0.901 | — |
| `ai-surface.agent-instruction-files` | `ai-surface` | Agent instruction files (Cursor / Claude) | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.agents-md-quality` | `ai-surface` | AGENTS.md quality | **experimental** | — | 0.901 | — |
| `ai-surface.changelog-present` | `ai-surface` | Structured CHANGELOG (versioning) | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.component-manifest-json` | `ai-surface` | Component manifest JSON | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.ds-index-exported` | `ai-surface` | DS index export | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.llms-txt-structure` | `ai-surface` | llms.txt structure | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.mcp-config-present` | `ai-surface` | MCP config present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.migration-guide-present` | `ai-surface` | Migration / upgrade guide | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.semver-versioning` | `ai-surface` | Semver version (package.json) | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.shadcn-registry-valid` | `ai-surface` | shadcn registry validity | **stable** | 0.901 | 0.904 | ✅ |
| `ai-governance.ai-content-live-region` | `ai-governance` | AI content live region | **experimental** | — | 0.901 | — |
| `ai-governance.ai-loading-error-states` | `ai-governance` | AI loading state & error state | **experimental** | — | 0.901 | — |
| `ai-governance.ai-marker-anti-patterns` | `ai-governance` | AI-marker anti-patterns | **experimental** | — | 0.901 | — |
| `ai-governance.ai-marker-component-present` | `ai-governance` | AI-marker component present | **experimental** | — | 0.901 | — |
| `ai-governance.ai-token-requires-marker` | `ai-governance` | AI token requires co-located marker | **experimental** | — | 0.100 | — |
| `ai-governance.ai-tokens-reserved` | `ai-governance` | Reserved AI-marker tokens inventory | **experimental** | — | 0.409 | — |
| `ai-governance.disclaimer-present` | `ai-governance` | AI disclaimer present | **experimental** | — | 0.901 | — |
| `ai-governance.explainability-affordance` | `ai-governance` | Explainability affordance | **experimental** | — | 0.901 | — |
| `ai-governance.feedback-control-present` | `ai-governance` | AI feedback control present | **experimental** | — | 0.901 | — |
| `ai-governance.human-control-affordances` | `ai-governance` | Human-control affordances | **experimental** | — | 0.901 | — |
| `ai-governance.value-gate-doc-present` | `ai-governance` | AI value-gate governance doc | **experimental** | — | 0.641 | — |
