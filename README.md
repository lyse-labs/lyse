# Lyse

> Design systems drift. Lyse measures it.

The local, deterministic health score for your design system — audit, explain, and hand the fixes to your coding agent, locally or in CI.

[![ci](https://github.com/lyse-labs/lyse/actions/workflows/ci.yml/badge.svg)](https://github.com/lyse-labs/lyse/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40lyse-labs%2Flyse?logo=npm&label=npm)](https://www.npmjs.com/package/@lyse-labs/lyse)
[![downloads](https://img.shields.io/npm/dm/%40lyse-labs%2Flyse?label=downloads)](https://www.npmjs.com/package/@lyse-labs/lyse)
[![license](https://img.shields.io/badge/license-agplv3%20%2F%20commercial-blue)](./LICENSE)

## Quickstart

AI coding agents ship UI fast — and hardcode `#3b82f6` where `color.brand.primary` exists, reinvent `<Button>`, and skip stories. Lyse audits the drift they (and humans) introduce, scores it 0–100, and hands the fixes back to the same agent.

```bash
npx -y @lyse-labs/lyse@latest
```

That's it — no config, no prompts, your Health Score in seconds.

## Optional: calibrate

`lyse init` detects your framework, writes `.lyse.yaml`, and optionally wires the MCP server for your AI agent.

```bash
npx -y @lyse-labs/lyse@latest init
```

## Commands

```bash
lyse audit        # rerun the audit (text, JSON, or SARIF)
lyse handoff      # audit, then hand the findings to your coding agent to fix (Claude Code / Cursor / Codex)
lyse init --scaffold        # generate missing AI-readiness files (llms.txt, AGENTS.md)
lyse init --migrate-tokens  # convert legacy {value,type} token JSON to DTCG ({$value,$type})
lyse explain X    # rationale + examples for a rule
lyse mcp setup    # wire MCP into Cursor / Claude Code / Codex
lyse add ci-gate  # install the score-regression CI gate (.github/workflows/lyse.yml)
lyse share        # copy a Markdown summary to your clipboard
```

> **Trust boundary.** `lyse handoff` launches your coding agent with its permission prompts bypassed so it can apply fixes unattended. Only run it on repositories you trust.

## What it audits

A Health Score (0–100) across **6 axes** — tokens, a11y, components, stories, ai-surface, ai-governance — from deterministic static rules. CMMI-style maturity tier (Foundational → Autonomous) mapped from the score. No LLM, no network, fully local by default. Full formula and per-rule docs in [`docs/`](./docs/).

The optional **render layer** (`lyse audit --render`) runs additional checks against a pre-built Storybook (`storybook-static/` or a URL): `tokens/rendered-token-fidelity` (CSS custom property drift) and `a11y/runtime-axe` (axe-core a11y violations). Both are experimental and do not affect the Health Score.

`lyse explain --score` also reports an **AI-Governance Maturity Level** (L0–L5, by presence of AI affordances — marker components, AI tokens, interaction patterns, governance docs). Deterministic by default; an optional LLM tier reads semantic affordances for the harder cases.

## Privacy

`lyse audit` is **static-only by default**: nothing leaves your machine. The optional LLM precision filter is **opt-in** (`--llm`, `LYSE_LLM=1`, or explicit `llm.provider` config) and BYOK — having the `claude` CLI installed does not enable it silently, and the default audit never prompts for it. Telemetry is opt-in only (a one-time prompt shown after your first report, default declines). See [PRIVACY.md](./PRIVACY.md).

## More

- [`CHANGELOG.md`](./CHANGELOG.md) — release history
- [`docs/`](./docs/) — full documentation, rule pages, architecture
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to add a rule or fix a bug
- [`LICENSE`](./LICENSE) / [`COMMERCIAL.md`](./COMMERCIAL.md) — dual AGPLv3 / commercial
- [`SECURITY.md`](./SECURITY.md) — vulnerability reports

---

© 2026 Lyse Labs.
