# Lyse

> Measure design system drift. Audit, explain, fix — locally, deterministically, in CI or live for AI agents.

[![ci](https://github.com/lyse-labs/lyse/actions/workflows/ci.yml/badge.svg)](https://github.com/lyse-labs/lyse/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40lyse-labs%2Flyse?logo=npm&label=npm)](https://www.npmjs.com/package/@lyse-labs/lyse)
[![downloads](https://img.shields.io/npm/dm/%40lyse-labs%2Flyse?label=downloads)](https://www.npmjs.com/package/@lyse-labs/lyse)
[![license](https://img.shields.io/badge/license-agplv3%20%2F%20commercial-blue)](./LICENSE)

## Quickstart

```bash
npx @lyse-labs/lyse init
```

That's it. `lyse init` detects your framework, writes `.lyse.yaml`, optionally wires the MCP server for your AI agent, and prints your first Health Score (0–100).

## After init

```bash
lyse audit        # rerun the audit (text, JSON, or SARIF)
lyse fix          # auto-fix high-confidence findings (clean git tree required)
lyse explain X    # rationale + examples for a rule
lyse mcp setup    # wire MCP into Cursor / Claude Code / Codex
lyse share        # copy a Markdown summary to your clipboard
```

Running `lyse` with no subcommand opens an interactive menu and loops back after each action.

## What it audits

A Health Score (0–100) across **5 axes** — tokens, a11y, components, stories, ai-surface — from deterministic static rules. CMMI-style maturity tier (Foundational → Autonomous) mapped from the score. No LLM, no network, fully local by default. Full formula and per-rule docs in [`docs/`](./docs/).

## Privacy

`lyse audit` is **static-only**: nothing leaves your machine. Telemetry is opt-in only (one-time prompt, default declines). See [PRIVACY.md](./PRIVACY.md).

## More

- [`CHANGELOG.md`](./CHANGELOG.md) — release history
- [`docs/`](./docs/) — full documentation, rule pages, architecture
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a rule or fix a bug
- [`LICENSE`](./LICENSE) / [`COMMERCIAL.md`](./COMMERCIAL.md) — dual AGPLv3 / commercial
- [`SECURITY.md`](./SECURITY.md) — vulnerability reports

---

© 2026 Lyse Labs.
