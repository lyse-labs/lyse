# Lyse — Sub-axes coverage

> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.

> Generated: deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)

**72 sub-axes total** — stable: 52 · experimental: 20 · disabled: 0

Only sub-axes with `status: stable` contribute to the Health Score by default. Promotion gate: N ≥ 30 labeled samples AND Wilson 95 % lower bound ≥ 0.90 on recall. See [`docs/architecture/reliability.md`](./reliability.md) for methodology.

> **Precision / Recall (LB) column note:** Lower bounds are Wilson 95 % estimates. Most rows were calibrated against the fixed-N synthetic recall suite; only `tokens/no-hardcoded-color`, `tokens/no-hardcoded-shadow`, and `components/contracts-strictness` have an in-repo adversarial N (see the [Per-rule SLO](./per-rule-slo.md) page for N values).

| ID | Axis | Name | Status | Precision (LB) | Recall (LB) | In Score |
|---|---|---|---|---|---|---|
| `tokens.border-radius` | `tokens` | Radii token scale | **stable** | 0.958 | 0.916 | ✅ |
| `tokens.border-width` | `tokens` | Border-width token scale | **stable** | 0.974 | 0.916 | ✅ |
| `tokens.color` | `tokens` | Color tokens | **experimental** | — | — | — |
| `tokens.container-query` | `tokens` | Container-query containment context | **stable** | 0.912 | 0.901 | ✅ |
| `tokens.css-custom-property-export` | `tokens` | CSS custom-property theme export | **stable** | 0.904 | 0.901 | ✅ |
| `tokens.deprecated-token-usage` | `tokens` | Deprecated-token aliasing ($deprecated) | **stable** | 0.901 | 0.904 | ✅ |
| `tokens.description-coverage` | `tokens` | Token description coverage | **stable** | 0.901 | 0.901 | ✅ |
| `tokens.dtcg-conformance` | `tokens` | DTCG conformance | **stable** | 0.901 | 0.901 | ✅ |
| `tokens.gradient` | `tokens` | Gradient token (vs inline literal) | **experimental** | 0.904 | 0.904 | — |
| `tokens.media-query` | `tokens` | Media-query breakpoint drift | **stable** | 0.912 | 0.912 | ✅ |
| `tokens.motion` | `tokens` | Motion token scale (duration/easing) | **stable** | 0.918 | 0.916 | ✅ |
| `tokens.opacity` | `tokens` | Opacity token scale | **stable** | 0.989 | 0.916 | ✅ |
| `tokens.rendered-token-fidelity` | `tokens` | Rendered token fidelity | **experimental** | 0.000 | 0.000 | — |
| `tokens.responsive-breakpoints` | `tokens` | Responsive breakpoint scale | **stable** | 0.904 | 0.901 | ✅ |
| `tokens.shadow` | `tokens` | Shadow / elevation token scale | **experimental** | 0.510 | 0.510 | — |
| `tokens.spacing` | `tokens` | Spacing tokens | **stable** | 0.985 | 0.904 | ✅ |
| `tokens.theme-modes` | `tokens` | Theme modes (light/dark) | **stable** | 0.901 | 0.904 | ✅ |
| `tokens.typography` | `tokens` | Typography token scale (size/weight/letter-spacing) | **stable** | 0.989 | 0.916 | ✅ |
| `tokens.z-index` | `tokens` | Z-index token scale | **stable** | 0.988 | 0.916 | ✅ |
| `a11y.contrast-tokens` | `a11y` | Static WCAG-AA contrast (co-applied fg/bg pairs) | **experimental** | — | — | — |
| `a11y.essentials` | `a11y` | jsx-a11y essentials | **stable** | 0.908 | 0.904 | ✅ |
| `a11y.focus-visible` | `a11y` | focus-visible adoption | **stable** | 0.904 | 0.901 | ✅ |
| `a11y.forced-colors` | `a11y` | Forced-colors / high-contrast support | **stable** | 0.916 | 0.901 | ✅ |
| `a11y.html-lang` | `a11y` | Document language (html lang) | **stable** | 0.912 | 0.901 | ✅ |
| `a11y.inclusive-language` | `a11y` | Inclusive language | **stable** | 0.904 | 0.901 | ✅ |
| `a11y.interactive-role-name` | `a11y` | Accessible name on interactive controls | **experimental** | — | — | — |
| `a11y.prefers-reduced-motion` | `a11y` | prefers-reduced-motion compliance | **stable** | 0.904 | 0.901 | ✅ |
| `a11y.runtime-axe` | `a11y` | Runtime a11y (axe-core on Storybook) | **experimental** | 0.000 | 0.000 | — |
| `a11y.semantic-html` | `a11y` | Semantic HTML (no static-element interactions) | **stable** | 0.916 | 0.934 | ✅ |
| `components.contracts-strictness` | `components` | Component prop contract strictness | **experimental** | 0.901 | 0.901 | — |
| `components.doc-comments` | `components` | Component doc-comment presence (public API) | **stable** | 0.929 | 0.901 | ✅ |
| `components.icon-decorative-aria` | `components` | Inline SVG accessible treatment | **stable** | 0.916 | 0.901 | ✅ |
| `components.naming-component-pascalcase` | `components` | Component PascalCase | **stable** | 0.904 | 0.904 | ✅ |
| `components.naming-hook-prefix` | `components` | Hook `use` prefix | **stable** | 0.904 | 0.904 | ✅ |
| `components.native-shadows` | `components` | Native shadow elements | **stable** | 0.901 | 0.901 | ✅ |
| `components.no-arbitrary-tailwind` | `components` | No arbitrary Tailwind values (non-color) | **experimental** | — | — | — |
| `components.no-icon-fonts` | `components` | Icon delivery (SVG over icon-font) | **stable** | 0.904 | 0.901 | ✅ |
| `components.no-style-escape-hatch` | `components` | No inline style on DS components | **experimental** | — | — | — |
| `components.svg-viewbox` | `components` | Inline SVG viewBox (scalable icons) | **stable** | 0.901 | 0.904 | ✅ |
| `stories.coverage` | `stories` | Storybook coverage | **stable** | 0.901 | 0.901 | ✅ |
| `stories.props-documented` | `stories` | Story documents component props | **experimental** | — | — | — |
| `stories.usage-examples` | `stories` | Story shows usage examples | **experimental** | — | — | — |
| `ai-surface.agent-instruction-files` | `ai-surface` | Agent instruction files (Cursor / Claude) | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.agents-md-quality` | `ai-surface` | AGENTS.md quality | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.changelog-present` | `ai-surface` | Structured CHANGELOG (versioning) | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.component-manifest-completeness` | `ai-surface` | Component manifest completeness (props/variants/examples) | **experimental** | 0.439 | 0.439 | — |
| `ai-surface.component-manifest-json` | `ai-surface` | Component manifest JSON | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.deprecation-markers` | `ai-surface` | Deprecation marker quality (@deprecated) | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.ds-index-exported` | `ai-surface` | DS index export | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.llms-txt-structure` | `ai-surface` | llms.txt structure | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.mcp-config-present` | `ai-surface` | MCP config present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-surface.migration-guide-present` | `ai-surface` | Migration / upgrade guide | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.semver-versioning` | `ai-surface` | Semver version (package.json) | **stable** | 0.901 | 0.904 | ✅ |
| `ai-surface.shadcn-registry-valid` | `ai-surface` | shadcn registry validity | **stable** | 0.901 | 0.904 | ✅ |
| `ai-governance.ai-content-live-region` | `ai-governance` | AI content live region | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.ai-loading-error-states` | `ai-governance` | AI loading state & error state | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.ai-marker-anti-patterns` | `ai-governance` | AI-marker anti-patterns | **experimental** | — | 0.901 | — |
| `ai-governance.ai-marker-component-present` | `ai-governance` | AI-marker component present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.ai-token-misuse` | `ai-governance` | AI token misused on non-AI element | **stable** | 0.901 | 0.912 | ✅ |
| `ai-governance.ai-token-requires-marker` | `ai-governance` | AI token requires co-located marker | **experimental** | — | 0.100 | — |
| `ai-governance.ai-tokens-reserved` | `ai-governance` | Reserved AI-marker tokens inventory | **experimental** | — | 0.409 | — |
| `ai-governance.bot-identity-labeling` | `ai-governance` | AI non-human identity labeling | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.confidence-indicator-present` | `ai-governance` | AI confidence indicator present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.disclaimer-present` | `ai-governance` | AI disclaimer present | **experimental** | — | 0.901 | — |
| `ai-governance.draft-attribution` | `ai-governance` | AI draft-attribution convention | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.explainability-affordance` | `ai-governance` | Explainability affordance | **experimental** | — | 0.901 | — |
| `ai-governance.feedback-control-present` | `ai-governance` | AI feedback control present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.human-control-affordances` | `ai-governance` | Human-control affordances | **experimental** | — | 0.901 | — |
| `ai-governance.interaction-pattern-docs` | `ai-governance` | AI interaction-pattern docs present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.product-analytics` | `ai-governance` | AI product-analytics instrumentation | **stable** | 0.916 | 0.901 | ✅ |
| `ai-governance.source-attribution-present` | `ai-governance` | AI source attribution present | **stable** | 0.901 | 0.901 | ✅ |
| `ai-governance.value-gate-doc-present` | `ai-governance` | AI value-gate governance doc | **experimental** | — | 0.641 | — |
