# Rules

Lyse ships with 65 rules (63 in the table below, plus 2 render-only experimental rules — see [Render-only and experimental rules](#render-only-and-experimental-rules)). Each rule has a stable ID, a version, a severity, an axis, and (optionally) a codemod for auto-fix.

Rule output appears in:
- Terminal text (default reporter).
- JSON output (under `findings[]`).
- SARIF 2.1.0 output (each `result` references a `rule` with a `helpUri` linking to one of the pages here).

## Ruleset

| Rule ID | Axis | Severity | Auto-fixable | Doc |
|---|---|---|---|---|
| `tokens/no-hardcoded-color` | Tokens | warning | Yes | [→](./tokens-no-hardcoded-color.md) |
| `tokens/no-hardcoded-spacing` | Tokens | warning | Yes | [→](./tokens-no-hardcoded-spacing.md) |
| `tokens/dtcg-conformance` | Tokens | warning | No | [→](./tokens-dtcg-conformance.md) |
| `tokens/description-coverage` | Tokens | info | No | — |
| `tokens/responsive-breakpoints` | Tokens | warning | No | [→](./tokens-responsive-breakpoints.md) |
| `tokens/css-custom-property-export` | Tokens | warning | No | [→](./tokens-css-custom-property-export.md) |
| `tokens/no-hardcoded-media-query` | Tokens | warning | No | [→](./tokens-no-hardcoded-media-query.md) |
| `tokens/container-query` | Tokens | warning | No | [→](./tokens-container-query.md) |
| `tokens/no-hardcoded-z-index` | Tokens | warning | No | [→](./tokens-no-hardcoded-z-index.md) |
| `tokens/no-hardcoded-shadow` | Tokens | warning | No | [→](./tokens-no-hardcoded-shadow.md) |
| `tokens/no-hardcoded-gradient` | Tokens | warning | No | [→](./tokens-no-hardcoded-gradient.md) |
| `tokens/no-hardcoded-typography` | Tokens | warning | No | [→](./tokens-no-hardcoded-typography.md) |
| `tokens/no-hardcoded-opacity` | Tokens | warning | No | [→](./tokens-no-hardcoded-opacity.md) |
| `tokens/no-hardcoded-border-radius` | Tokens | warning | No | [→](./tokens-no-hardcoded-border-radius.md) |
| `tokens/no-hardcoded-border-width` | Tokens | warning | No | [→](./tokens-no-hardcoded-border-width.md) |
| `tokens/no-hardcoded-motion` | Tokens | warning | No | [→](./tokens-no-hardcoded-motion.md) |
| `a11y/essentials` | A11y | error | No | [→](./a11y-essentials.md) |
| `a11y/prefers-reduced-motion` | A11y | warning | No | [→](./a11y-prefers-reduced-motion.md) |
| `a11y/focus-visible` | A11y | warning | No | [→](./a11y-focus-visible.md) |
| `a11y/inclusive-language` | A11y | info | No | [→](./a11y-inclusive-language.md) |
| `a11y/forced-colors` | A11y | warning | No | [→](./a11y-forced-colors.md) |
| `a11y/html-lang` | A11y | warning | No | [→](./a11y-html-lang.md) |
| `a11y/semantic-html` | A11y | warning | No | [→](./a11y-semantic-html.md) |
| `components/no-native-shadows` | Components | warning | Yes | [→](./components-shadow-native.md) |
| `components/no-icon-fonts` | Components | warning | No | [→](./components-no-icon-fonts.md) |
| `components/svg-viewbox` | Components | warning | No | [→](./components-svg-viewbox.md) |
| `components/icon-decorative-aria` | Components | warning | No | [→](./components-icon-decorative-aria.md) |
| `components/contracts-strictness` | Components | warning | No | [→](./components-contracts-strictness.md) |
| `components/doc-comments` | Components | info | No | [→](./components-doc-comments.md) |
| `naming/component-pascalcase` | Components | warning | Yes | [→](./naming-component-pascalcase.md) |
| `naming/hook-prefix` | Components | warning | Yes | [→](./naming-hook-prefix.md) |
| `stories/coverage` | Stories | info | No | [→](./storybook-coverage.md) |
| `ai-surface/agents-md-quality` | AI surface | warning | No | — |
| `ai-surface/component-manifest-json` | AI surface | warning | No | — |
| `ai-surface/ds-index-exported` | AI surface | warning | No | — |
| `ai-surface/mcp-config-present` | AI surface | warning | No | [→](./ai-surface-mcp-config-present.md) |
| `ai-surface/llms-txt-structure` | AI surface | warning | No | [→](./ai-surface-llms-txt-structure.md) |
| `ai-surface/shadcn-registry-valid` | AI surface | warning | No | [→](./ai-surface-shadcn-registry-valid.md) |
| `ai-surface/agent-instruction-files` | AI surface | warning | No | [→](./ai-surface-agent-instruction-files.md) |
| `tokens/deprecated-token-usage` | Tokens | warning | No | [→](./tokens-deprecated-token-usage.md) |
| `tokens/theme-modes-present` | Tokens | warning | No | — |
| `versioning/changelog-present` | AI surface | warning | No | [→](./versioning-changelog-present.md) |
| `versioning/semver-versioning` | AI surface | warning | No | [→](./versioning-semver-versioning.md) |
| `versioning/migration-guide-present` | AI surface | warning | No | [→](./versioning-migration-guide-present.md) |
| `versioning/deprecation-markers` | AI surface | warning | No | [→](./versioning-deprecation-markers.md) |
| `ai-governance/ai-tokens-reserved` | AI governance | info | No | [→](./ai-governance-ai-tokens-reserved.md) |
| `ai-governance/ai-marker-component-present` | AI governance | warning | No | [→](./ai-governance-ai-marker-component-present.md) |
| `ai-governance/ai-token-requires-marker` | AI governance | error | No | [→](./ai-governance-ai-token-requires-marker.md) |
| `ai-governance/ai-marker-anti-patterns` | AI governance | warning | No | [→](./ai-governance-ai-marker-anti-patterns.md) |
| `ai-governance/ai-loading-error-states` | AI governance | warning | No | [→](./ai-governance-ai-loading-error-states.md) |
| `ai-governance/ai-content-live-region` | AI governance | warning | No | [→](./ai-governance-ai-content-live-region.md) |
| `ai-governance/disclaimer-present` | AI governance | warning | No | [→](./ai-governance-disclaimer-present.md) |
| `ai-governance/feedback-control-present` | AI governance | warning | No | [→](./ai-governance-feedback-control-present.md) |
| `ai-governance/explainability-affordance` | AI governance | warning | No | [→](./ai-governance-explainability-affordance.md) |
| `ai-governance/human-control-affordances` | AI governance | warning | No | [→](./ai-governance-human-control-affordances.md) |
| `ai-governance/value-gate-doc-present` | AI governance | warning | No | [→](./ai-governance-value-gate-doc-present.md) |
| `ai-governance/confidence-indicator-present` | AI governance | warning | No | [→](./ai-governance-confidence-indicator-present.md) |
| `ai-governance/source-attribution-present` | AI governance | warning | No | [→](./ai-governance-source-attribution-present.md) |
| `ai-governance/bot-identity-labeling` | AI governance | warning | No | [→](./ai-governance-bot-identity-labeling.md) |
| `ai-governance/ai-token-misuse` | AI governance | warning | No | [→](./ai-governance-ai-token-misuse.md) |
| `ai-governance/interaction-pattern-docs` | AI governance | warning | No | [→](./ai-governance-interaction-pattern-docs.md) |
| `ai-governance/draft-attribution` | AI governance | warning | No | [→](./ai-governance-draft-attribution.md) |
| `ai-governance/product-analytics` | AI governance | warning | No | [→](./ai-governance-product-analytics.md) |

## Render-only and experimental rules

Some rules require the opt-in render layer (`lyse audit --render`) and do not contribute to the Health Score:

| Rule ID | Requires | Status |
|---|---|---|
| `a11y/runtime-axe` | `--render` + pre-built Storybook | experimental |
| `tokens/rendered-token-fidelity` | `--render` + pre-built Storybook | experimental |

These rules are reported-only until calibration data is available from real design system corpora.

## How rules score

Each rule contributes findings on one axis. Per-axis scores are computed by the scorer (`packages/core/src/scorer.ts`) — see [the Health Score page](../guide/health-score.md) for the full formula.

## Disabling a rule

Add it to `.lyse.yaml`:

```yaml
rules:
  stories/coverage: off
```

Disabled rules contribute no findings and have no effect on their axis score.

## Allowlists

Many rules support an inline allowlist via a comment directive. The syntax varies per rule — see each rule's page for specifics.

The generic pattern:

```ts
// lyse-disable-next-line tokens/no-hardcoded-color
const fallbackColor = "#ff0000";
```

Allowlisted findings are still reported with `severity: "off"` for transparency, but do not affect the score.

## Stable IDs and versioning

Rule IDs follow `<axis>/<slug>` and are stable. Renaming a rule is a major-version change.

Each rule has its own version (`v1`, `v2`, ...) bumped when behavior changes materially. The version appears in JSON / SARIF output.

## Adding a rule

See [CONTRIBUTING.md](../../CONTRIBUTING.md) → "Rule contributions" for the process.
