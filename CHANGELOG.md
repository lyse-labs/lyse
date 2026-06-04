# Changelog

All notable changes to Lyse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First public release on npm under the scoped name **`@lyse-labs/lyse`**.
The unscoped `lyse` package name on npm was previously claimed by another
publisher and is in tombstone state, so installs use the scoped form:

    npx @lyse-labs/lyse audit
    npm install -g @lyse-labs/lyse

The CLI binary itself is still invoked as `lyse` after install. The
companion scaffolding package `create-lyse` keeps its unscoped name so
that `npm create lyse@latest` continues to work as a one-shot bootstrap.

### Added

- Opt-in email capture for release & security updates at the end of
  `lyse init` AND `lyse audit` (whichever the user reaches first). Asked
  at most once per machine and delivered to `api.getlyse.com/v1/profile/email`
  with at-least-once semantics:
  - Accept ⇒ persist `{ email, createdAt, lyseVersion, sentAt? }` to
    `~/.lyse/profile.json` and POST. `sentAt` is stamped after a 2xx.
  - Skip ⇒ persist `{ declined: true, declinedAt, lyseVersion }`. No POST.
  - Captured-but-undelivered emails are retried by `syncPendingEmail` at
    the start of every `lyse audit` (incl. non-TTY / CI) so the queue
    drains as soon as the network recovers. Worker upserts on email.
  - Skip paths: `--yes`, `LYSE_NO_EMAIL_PROMPT=1`, CI, non-TTY, or empty
    Enter. `LYSE_NO_EMAIL_POST=1` suppresses the network POST only.
    `LYSE_EMAIL_ENDPOINT` overrides the URL for local dev / self-hosting.
- Interactive root menu (REPL). Running `lyse` with no subcommand on a TTY
  now opens a select menu — Run audit · Apply auto-fixes · Set up MCP for
  AI · Explain a rule · Bench-pack · Telemetry settings · Exit — and loops
  back to the menu after each action instead of exiting. Suppressed by
  `--no-menu`, `LYSE_NO_MENU=1`, or any non-TTY context (CI, piped stdin),
  where the standard help text is printed instead. Invoking a subcommand
  directly (`lyse audit`, `lyse fix`, …) bypasses the menu.
- `lyse audit --limit=<n|all>` — control how many findings the text / eslint /
  legacy outputs render. Default `10`; `all` (or `0`) shows every finding;
  `--format=json|sarif` ignores the flag and always returns the full report.
  The post-audit "Show findings" menu entry now honours the same value.
- `withSpinner()` helper applied across long-running commands (`fix`, `init`,
  `mcp setup`, `bench-pack`). Suppressed by `--quiet`, `LYSE_QUIET=1`,
  non-TTY stderr, or `--format=json|sarif`.
- `lyse audit` — local-first design-system health audit (Health Score 0–100,
  5-tier maturity model, deterministic output).
- `lyse fix` — high-confidence codemods (color, spacing, shadow, naming) with
  6 safety guards (clean git tree, dry-run by default in non-TTY contexts,
  per-run file-count cap, etc.).
- `lyse explain` — per-rule rationale, examples, and links to documentation.
- `lyse init` — opinionated bootstrap of `.lyse.yaml`, `lyse.components.json`,
  and `AGENTS.md`.
- `lyse mcp` — Model Context Protocol server exposing `audit_file` and
  `suggest_fix` tools to AI agents.
- 12 audit rules across 5 axes (tokens, a11y, components, stories, ai-surface).
- Companion benchmark corpus (70 OSS design systems) maintained in
  [`github.com/lyse-labs/lyse-bench`](https://github.com/lyse-labs/lyse-bench)
  (CC BY 4.0) for Health Score reproducibility.
- Opt-in anonymous telemetry (`LYSE_TELEMETRY=1`) feeding the public bench.
  No source code, file paths, or content leaves the user's machine.
  See [`PRIVACY.md`](./PRIVACY.md).

### Fixed

- MCP `audit_file` tool's `AUTO_FIXABLE_RULES` is derived from the rule
  registry, so adding a rule with `applyCodemod` is automatically reflected.
- Post-audit menu shows the "Auto-fix N high-confidence findings" option,
  classifying fixable findings the same way `lyse fix` does (shared
  `buildClassifyContext` / `countAutoFixable` helpers).
- Score gauge renders the `N experimental (not counted)` suffix and the
  ESLint-style output renders the `EXP` tag on low-confidence findings.
  The CLI calls `populateConfidence(result, ctx)` once after `auditDirectory`
  so every downstream consumer (score gauge, ESLint-style renderer,
  JSON/SARIF reporters, telemetry) sees the same per-finding confidence
  classification.
- `lyse share` shows the same phase-by-phase spinner as `lyse audit` while
  re-running the audit.

### Architecture

- Local-first by default. The CLI runs entirely on the user's machine.
- A small Cloudflare Worker (`api.getlyse.com`) handles opt-in telemetry
  and bench aggregation. Its source lives in a separate private repository;
  the CLI communicates with it strictly over HTTPS.
