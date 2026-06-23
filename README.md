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
lyse fix --scaffold  # generate missing AI-readiness files (llms.txt, AGENTS.md, value-gate doc)
lyse fix --migrate-tokens  # convert legacy {value,type} token JSON to DTCG ({$value,$type})
lyse explain X    # rationale + examples for a rule
lyse mcp setup    # wire MCP into Cursor / Claude Code / Codex
lyse add ci-gate  # install the score-regression CI gate (.github/workflows/lyse.yml)
lyse share        # copy a Markdown summary to your clipboard
```

Running `lyse` with no subcommand opens an interactive menu and loops back after each action.

## What it audits

A Health Score (0–100) across **6 axes** — tokens, a11y, components, stories, ai-surface, ai-governance — from deterministic static rules. CMMI-style maturity tier (Foundational → Autonomous) mapped from the score. No LLM, no network, fully local by default. Full formula and per-rule docs in [`docs/`](./docs/).

The optional **render layer** (`lyse audit --render`) runs additional checks against a pre-built Storybook (`storybook-static/` or a URL): `tokens/rendered-token-fidelity` (CSS custom property drift) and `a11y/runtime-axe` (axe-core a11y violations). Both are experimental and do not affect the Health Score.

`lyse explain --score` also reports an **AI-Governance Maturity Level** (L0–L5, by presence of AI affordances — marker components, AI tokens, interaction patterns, governance docs). Deterministic by default; an optional LLM tier reads semantic affordances for the harder cases.

## Privacy

`lyse audit` is **static-only by default**: nothing leaves your machine. The optional LLM precision filter is **opt-in** (`--llm`, `LYSE_LLM=1`, a one-time prompt, or explicit `llm.provider` config) and BYOK — having the `claude` CLI installed does not enable it silently. Telemetry is opt-in only (one-time prompt, default declines). See [PRIVACY.md](./PRIVACY.md).

## More

- [`CHANGELOG.md`](./CHANGELOG.md) — release history
- [`docs/`](./docs/) — full documentation, rule pages, architecture
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a rule or fix a bug
- [`LICENSE`](./LICENSE) / [`COMMERCIAL.md`](./COMMERCIAL.md) — dual AGPLv3 / commercial
- [`SECURITY.md`](./SECURITY.md) — vulnerability reports

---

© 2026 Lyse Labs.
