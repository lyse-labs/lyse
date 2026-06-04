# Lyse

> Measure design system drift. Audit, explain, fix — even with AI agents.

[![ci](https://github.com/lyse-labs/lyse/actions/workflows/ci.yml/badge.svg)](https://github.com/lyse-labs/lyse/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40lyse-labs%2Flyse?logo=npm&label=npm)](https://www.npmjs.com/package/@lyse-labs/lyse)
[![downloads](https://img.shields.io/npm/dm/%40lyse-labs%2Flyse?label=downloads)](https://www.npmjs.com/package/@lyse-labs/lyse)
[![typescript](https://img.shields.io/badge/typescript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![license](https://img.shields.io/badge/license-agplv3%20%2F%20commercial-blue)](./LICENSE)
[![mcp](https://img.shields.io/badge/model%20context%20protocol-supported-purple)](https://modelcontextprotocol.io/)

Lyse scans a repository, compares its UI code against the project's
design system (tokens, components, Storybook, Figma), and produces a
**Health Score** (0–100) plus actionable findings — in your terminal, as
JSON / SARIF (which you can wire into CI), or **live via an MCP server
your AI agent can query while writing code**.

```bash
npx @lyse-labs/lyse audit
```

That's the install. Two surfaces, one CLI:

| Surface | What it does |
|---|---|
| **CLI** | `lyse audit` prints a score + top findings to the terminal. SARIF / JSON for machines, codemods via `lyse fix`. |
| **MCP server** | `lyse mcp` — your AI agent (Cursor / Claude Code / Codex) audits its own unsaved buffers and asks for unified-diff fixes in real time. Exposes `audit_file` + `suggest_fix`. |

> Lyse's default audit is **static-only**: nothing leaves your machine. Lyse Labs never sees your code. See [PRIVACY.md](./PRIVACY.md) for the full data flow.

No web UI. No HTML report to host.
Full documentation lives in [`docs/`](./docs/).

---

## Quick start

### Interactive setup (recommended)

```bash
npm create lyse@latest
```

Runs `lyse init`: detects your framework, generates `.lyse.yaml`, optionally wires MCP, shows your first Health Score.

### Local CLI

```bash
npx @lyse-labs/lyse                              # interactive menu (TTY only — pick an action)
npx @lyse-labs/lyse audit                        # text output to terminal
npx @lyse-labs/lyse audit --format=json          # machine-readable JSON
npx @lyse-labs/lyse audit --format=sarif         # SARIF 2.1.0
npx @lyse-labs/lyse fix                          # auto-fix safe findings (clean git tree required)
npx @lyse-labs/lyse share                          # copy Markdown summary to clipboard
npx @lyse-labs/lyse explain tokens/no-hardcoded-color
npx @lyse-labs/lyse agents > AGENTS.md             # commit this for AI agents
npx @lyse-labs/lyse mcp setup                      # write MCP config to your IDE
```

Running `lyse` with no subcommand on a TTY opens an interactive menu and loops back after each action. Pass `--no-menu` or pipe stdin to skip it.

### MCP server (Cursor / Claude Code / Codex)

Add to `.cursor/mcp.json` (or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "lyse": {
      "command": "npx",
      "args": ["-y", "lyse", "mcp"]
    }
  }
}
```

Two tools your agent can call:
- `audit_file(path, content?)` — audit a file (even an unsaved buffer)
- `suggest_fix(path, rule_id, line)` — get a unified diff that fixes a finding

---

## The Health Score

```
For each active axis with opportunities > 0:
  weightedFindings = 4·errorCount + 2·warningCount + 1·infoCount
  rateScore        = max(0, 100 · (1 − weightedFindings / opportunities))
  absoluteCap      = 100 − K · log10(1 + weightedFindings)
  axisScore        = min(rateScore, absoluteCap)

finalScore = equal-weight mean of axisScore across active axes
tier       = scoreToTier(finalScore)
```

Equal axis weights (1/N for N active axes). K is calibrated on a public 8-repo corpus (currently K=0). Formula and edge cases in [`docs/guide/health-score.md`](./docs/guide/health-score.md). Per-rule documentation lives in [`docs/rules/`](./docs/rules/).

### What the audit measures

The Health Score is computed from **12 deterministic static rules** scored across **5 axes** (`tokens`, `a11y`, `components`, `stories`, `ai-surface`). Default audits are **static-only** — no LLM, no network, fully local.

| Axis | Rules |
|---|---|
| Tokens | `tokens/no-hardcoded-color`, `tokens/no-hardcoded-spacing`, `tokens/dtcg-conformance`, `tokens/description-coverage` |
| A11y | `a11y/essentials` (wraps `eslint-plugin-jsx-a11y`) |
| Components | `components/no-native-shadows`, `naming/component-pascalcase`, `naming/hook-prefix` |
| Stories | `stories/coverage` |
| AI surface | `ai-surface/agents-md-quality`, `ai-surface/component-manifest-json`, `ai-surface/ds-index-exported` |

A score of 43/100 means significant drift on the axes Lyse measures — it's a starting position, not a verdict.

### Maturity Tier

Every audit emits both a `finalScore` (0–100) and a CMMI-style **maturity tier** mapped from that score:

| Score | Tier | Reading |
|---|---|---|
| 80–100 | **Autonomous** | Coding agents can ship coherent UI without re-deriving the DS. |
| 60–79 | **Quantitative** | Drift is measurable and tractable; DS is well-enforced. |
| 40–59 | **Defined** | DS exists and is documented but only partially enforced. |
| 20–39 | **Managed** | DS exists in pockets; coverage and discipline are inconsistent. |
| 0–19 | **Foundational** | No enforced DS, or enforcement has not yet started. |

The tier vocabulary mirrors the CMMI process-maturity ladder DS leads already know from process-quality discussions, and gives the score a narrative beyond the raw number.

---

## Configuration

Optional `.lyse.yaml` at your repo root:

```yaml
designSystem:
  componentsModule: "@your-org/ui"
  excludePaths:
    - "packages/legacy/**"
```

---

## Status

See [`CHANGELOG.md`](./CHANGELOG.md) for release history and [`docs/`](./docs/) for full documentation.

Want to contribute? Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## License

Lyse's engine is **dual-licensed**: GNU AGPLv3 OR a commercial
license. See [`LICENSE`](./LICENSE) and [`COMMERCIAL.md`](./COMMERCIAL.md).

## Privacy

Telemetry is **opt-in only**. The CLI shows a one-time prompt on first audit (default declines, audit runs identically either way). For the full GDPR Arts. 13–14 notice, see [`PRIVACY.md`](./PRIVACY.md). For the narrower disclosure covering interactive feedback telemetry (`lyse audit --interactive`, `lyse feedback --missed`), see [`docs/guide/privacy.md`](./docs/guide/privacy.md).

## Security

To report vulnerabilities, see [`SECURITY.md`](./SECURITY.md).

---

© 2026 Lyse Labs.
