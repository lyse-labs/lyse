# lyse

> Audit your design system: Health Score, AGENTS.md, AI-ready contract.

```bash
npx @lyse-labs/lyse audit
```

CLI output (terminal-friendly) — or `--format=json` / `--format=sarif` for machines.

**Full docs and examples:** https://github.com/lyse-labs/lyse

## Features

- **12 deterministic rules** across 5 axes: tokens, a11y, components, stories, ai-surface
- **Deterministic, schema-versioned JSON output** (`schemas/v1/lyse-result.json`)
- **SARIF 2.1.0 output** — wire it into any SARIF-aware viewer (e.g. GitHub's Security tab via `github/codeql-action/upload-sarif`).
- **CLI commands:** `lyse audit`, `lyse fix`, `lyse explain`, `lyse agents`, `lyse share`, `lyse init`, `lyse mcp [setup|serve]`, `lyse feedback`, `lyse telemetry [on|off|status]`, `lyse bench-pack`, `lyse version`
- **Global flags:** `--yes`, `--no-prompt`, `--no-color`, `--quiet`, `--config=<path>`
- **Identity:** anonymous `repo_bucket` fingerprint
- **Telemetry:** opt-in only (first-run prompt, default OFF — see [PRIVACY.md](../../PRIVACY.md))

## Companion infrastructure

- **Cloudflare Worker** (`api.getlyse.com`) — serves the public anonymized bench summary and accepts opt-in telemetry events.
- Benchmark corpus (70 OSS design systems) maintained in the separate public repo [`lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench) (CC BY 4.0).

## License

© 2026 Lyse Labs. Dual-licensed: AGPL-3.0-only OR Commercial. See https://github.com/lyse-labs/lyse.

## Privacy

Telemetry is opt-in only. See [PRIVACY.md](https://github.com/lyse-labs/lyse/blob/main/PRIVACY.md) for the full GDPR Arts. 13–14 notice.
