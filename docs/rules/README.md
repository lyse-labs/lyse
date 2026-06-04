# Rules

Lyse ships with 12 rules. Each rule has a stable ID, a version, a severity, an axis, and (optionally) a codemod for auto-fix.

Rule output appears in:
- Terminal text (default reporter).
- JSON output (under `findings[]`).
- SARIF 2.1.0 output (each `result` references a `rule` with a `helpUri` linking to one of the pages here).

## Ruleset

| Rule ID | Axis | Severity | Auto-fixable | Doc |
|---|---|---|---|---|
| `tokens/no-hardcoded-color` | Tokens | warning | Yes | [→](./tokens-no-hardcoded-color.md) |
| `tokens/no-hardcoded-spacing` | Tokens | warning | Yes | [→](./tokens-no-hardcoded-spacing.md) |
| `tokens/dtcg-conformance` | Tokens | warning | No | — |
| `tokens/description-coverage` | Tokens | info | No | — |
| `a11y/essentials` | A11y | error | No | [→](./a11y-essentials.md) |
| `components/no-native-shadows` | Components | warning | Yes | [→](./components-shadow-native.md) |
| `naming/component-pascalcase` | Components | warning | Yes | [→](./naming-component-pascalcase.md) |
| `naming/hook-prefix` | Components | warning | Yes | [→](./naming-hook-prefix.md) |
| `stories/coverage` | Stories | info | No | [→](./storybook-coverage.md) |
| `ai-surface/agents-md-quality` | AI surface | warning | No | — |
| `ai-surface/component-manifest-json` | AI surface | warning | No | — |
| `ai-surface/ds-index-exported` | AI surface | warning | No | — |

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
