# Lyse Documentation

## For users

Start here if you want to use Lyse on your codebase.

- [Getting started](./guide/getting-started.md) — `npm create lyse@latest`, first audit, reading the output.
- [CLI reference](./guide/cli-reference.md) — all commands, flags, environment variables.
- [MCP server](./guide/mcp-server.md) — wire Lyse into Cursor, Claude Code, Codex.
- [Configuration](./guide/configuration.md) — `.lyse.yaml` reference.
- [Health Score](./guide/health-score.md) — the formula, axes, edge cases.
- [FAQ](./guide/faq.md) — common questions.
- [Troubleshooting](./guide/troubleshooting.md) — common errors and fixes.

## Rules

Per-rule documentation. Each rule's `helpUri` (visible in JSON / SARIF output) links to one of these pages.

- [All rules](./rules/) — index with severities, axes, fixability.

Highlights from the 12-rule set (full list at [`rules/`](./rules/)):

| Rule ID | Axis | Severity | Auto-fixable |
|---|---|---|---|
| [`tokens/no-hardcoded-color`](./rules/tokens-no-hardcoded-color.md) | Tokens | warning | Yes |
| [`tokens/no-hardcoded-spacing`](./rules/tokens-no-hardcoded-spacing.md) | Tokens | warning | Yes |
| [`components/no-native-shadows`](./rules/components-shadow-native.md) | Components | warning | Yes |
| [`a11y/essentials`](./rules/a11y-essentials.md) | A11y | error | No |
| [`stories/coverage`](./rules/storybook-coverage.md) | Stories | info | No |

## Methodology

- [Methodology](./methodology.md) — the two-faces model, signal inventory, maturity model, and how Lyse keeps scores honest.

## For contributors

If you want to contribute code, rules, or docs:

- [Contributing guide](../CONTRIBUTING.md) — process, conventions, rule contributions.
- [Architecture overview](./architecture/) — how the engine fits together.

## For users of the npm package

The published `lyse` npm package has its own README:

- [`packages/core/README.md`](../packages/core/README.md) — what npm users see on the package page.

## Other resources

- [Changelog](../CHANGELOG.md) — release history.
- [Code of Conduct](../CODE_OF_CONDUCT.md).
- [Security policy](../SECURITY.md) — vulnerability reporting.
- [Privacy policy](../PRIVACY.md) — telemetry, data handling.
- [License](../LICENSE) — AGPLv3 + Commercial dual.
