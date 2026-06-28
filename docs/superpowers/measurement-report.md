> **PARTIAL RUN — structural-only mode**: detection rules were not LLM-judged in this run.
> Their findings were harvested (see `nTotal`) but judging was deferred (LLM call latency too high
> for a full synchronous run). Re-run without `--structural-only` to judge detection rules.
> All detection-rule entries show `not-measured`.
# Measurement report

## walled (2)

| ruleId | kind | n | nTotal | precLB | recallSyn | labelSource |
|--------|------|---|--------|--------|-----------|-------------|
| versioning/changelog-present | structural | 2 | — | 0.342 | 1.000 | auto |
| versioning/semver-versioning | structural | 1 | — | 0.207 | 1.000 | auto |

## not-measured (71)

| ruleId | kind | n | nTotal | precLB | recallSyn | labelSource |
|--------|------|---|--------|--------|-----------|-------------|
| a11y/contrast-tokens | detection | 0 | 14 | — | 1.000 | none |
| a11y/essentials | detection | 0 | 202 | — | — | none |
| a11y/focus-visible | detection | 0 | — | — | — | none |
| a11y/forced-colors | detection | 0 | — | — | — | none |
| a11y/html-lang | detection | 0 | 2 | — | — | none |
| a11y/inclusive-language | detection | 0 | 63 | — | — | none |
| a11y/interactive-role-name | detection | 0 | 626 | — | 1.000 | none |
| a11y/prefers-reduced-motion | detection | 0 | — | — | — | none |
| a11y/runtime-axe | render-only | 0 | — | — | — | none |
| a11y/semantic-html | detection | 0 | 164 | — | — | none |
| ai-governance/ai-content-live-region | detection | 0 | — | — | 1.000 | none |
| ai-governance/ai-loading-error-states | detection | 0 | — | — | 1.000 | none |
| ai-governance/ai-marker-anti-patterns | detection | 0 | 5 | — | 1.000 | none |
| ai-governance/ai-marker-component-present | detection | 0 | — | — | 1.000 | none |
| ai-governance/ai-token-misuse | detection | 0 | — | — | 1.000 | none |
| ai-governance/ai-token-requires-marker | detection | 0 | — | — | — | none |
| ai-governance/ai-tokens-reserved | detection | 0 | — | — | — | none |
| ai-governance/bot-identity-labeling | detection | 0 | — | — | 1.000 | none |
| ai-governance/confidence-indicator-present | detection | 0 | — | — | 1.000 | none |
| ai-governance/disclaimer-present | detection | 0 | — | — | 1.000 | none |
| ai-governance/draft-attribution | detection | 0 | — | — | — | none |
| ai-governance/explainability-affordance | detection | 0 | — | — | — | none |
| ai-governance/feedback-control-present | detection | 0 | — | — | 1.000 | none |
| ai-governance/human-control-affordances | detection | 0 | — | — | — | none |
| ai-governance/interaction-pattern-docs | detection | 0 | — | — | 1.000 | none |
| ai-governance/product-analytics | detection | 0 | — | — | 1.000 | none |
| ai-governance/source-attribution-present | detection | 0 | — | — | 1.000 | none |
| ai-governance/value-gate-doc-present | detection | 0 | — | — | 1.000 | none |
| ai-surface/agent-instruction-files | structural | 0 | — | — | 1.000 | none |
| ai-surface/agents-md-quality | structural | 0 | — | — | 1.000 | none |
| ai-surface/component-manifest-completeness | structural | 0 | — | — | — | none |
| ai-surface/component-manifest-json | structural | 0 | — | — | 1.000 | none |
| ai-surface/ds-index-exported | structural | 0 | — | — | — | none |
| ai-surface/llms-txt-structure | structural | 0 | — | — | 1.000 | none |
| ai-surface/mcp-config-present | structural | 0 | — | — | 1.000 | none |
| ai-surface/shadcn-registry-valid | structural | 0 | — | — | 1.000 | none |
| components/contracts-strictness | detection | 0 | 221 | — | 1.000 | none |
| components/doc-comments | structural | 0 | — | — | — | none |
| components/icon-decorative-aria | detection | 0 | 200 | — | 1.000 | none |
| components/no-arbitrary-tailwind | detection | 0 | 13539 | — | 1.000 | none |
| components/no-icon-fonts | detection | 0 | — | — | 1.000 | none |
| components/no-native-shadows | detection | 0 | — | — | 1.000 | none |
| components/no-style-escape-hatch | detection | 0 | — | — | 1.000 | none |
| components/standardized-variant-props | detection | 0 | — | — | 1.000 | none |
| components/svg-viewbox | detection | 0 | 30 | — | 1.000 | none |
| naming/component-pascalcase | structural | 0 | — | — | 1.000 | none |
| naming/hook-prefix | structural | 0 | — | — | 1.000 | none |
| stories/coverage | structural | 0 | — | — | 1.000 | none |
| stories/props-documented | structural | 0 | — | — | 1.000 | none |
| stories/usage-examples | structural | 0 | — | — | 1.000 | none |
| tokens/container-query | detection | 0 | — | — | 1.000 | none |
| tokens/css-custom-property-export | structural | 0 | — | — | 1.000 | none |
| tokens/deprecated-token-usage | detection | 0 | — | — | 1.000 | none |
| tokens/description-coverage | structural | 0 | — | — | — | none |
| tokens/dtcg-conformance | structural | 0 | — | — | 1.000 | none |
| tokens/no-hardcoded-border-radius | detection | 0 | 163 | — | 1.000 | none |
| tokens/no-hardcoded-border-width | detection | 0 | 53 | — | 1.000 | none |
| tokens/no-hardcoded-color | detection | 0 | 1101 | — | 1.000 | none |
| tokens/no-hardcoded-gradient | detection | 0 | 100 | — | 1.000 | none |
| tokens/no-hardcoded-media-query | detection | 0 | 41 | — | 1.000 | none |
| tokens/no-hardcoded-motion | detection | 0 | 344 | — | 1.000 | none |
| tokens/no-hardcoded-opacity | detection | 0 | 119 | — | 1.000 | none |
| tokens/no-hardcoded-shadow | detection | 0 | 55 | — | 1.000 | none |
| tokens/no-hardcoded-spacing | detection | 0 | 3359 | — | 1.000 | none |
| tokens/no-hardcoded-typography | detection | 0 | 198 | — | 1.000 | none |
| tokens/no-hardcoded-z-index | detection | 0 | 70 | — | 1.000 | none |
| tokens/rendered-token-fidelity | render-only | 0 | — | — | — | none |
| tokens/responsive-breakpoints | structural | 0 | — | — | 1.000 | none |
| tokens/theme-modes-present | structural | 0 | — | — | 1.000 | none |
| versioning/deprecation-markers | detection | 0 | 10 | — | 1.000 | none |
| versioning/migration-guide-present | structural | 0 | — | — | 1.000 | none |
