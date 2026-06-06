# Changelog

All notable changes to Lyse will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- `create-lyse` package (the unscoped `npm create lyse@latest` wrapper).
  Lyse is a drift scanner for existing projects, not a project scaffolder
  — the `create-*` convention is for project starters (Vite, Next, React).
  Users should run `npx @lyse-labs/lyse init` instead, which matches the
  install flow of comparable scanner/linter tools (ESLint, Prettier,
  Biome, Knip). The `packages/create/` workspace has been removed and
  both published versions (`0.1.0-alpha.2`, `0.1.0-alpha.3`) have been
  unpublished from npm.

### Fixed
- Reverted erroneous `stable` promotion of 3 AI-Consumable sub-axes (`agents-md-quality`, `component-manifest-json`, `ds-index-exported`). They were promoted without calibration evidence (all measurement fields were `null`), which directly contradicted the public falsifiable claim in `docs/architecture/reliability.md` that the promotion gate requires N≥30 + Wilson 95% LB ≥0.90 on recall. Until the Bench corpus runs and populates the 5 measurement fields, all 17 sub-axes ship as `experimental`.
- Bumped stale `12 sub-axes` references in `reliability.md` and `health-score.md` to the actual count (17).
- Regenerated `rules-manifest.json` and `docs/architecture/sub-axes.md` from rule metadata (single source of truth).
- Added test invariant: any sub-axis with `status: stable` MUST have non-null `recallWilsonLowerBound \geq 0.9` and non-null `lastCalibrated` (enforces the promotion gate at code level so future violations fail CI).

### Added

- `ai-governance/ai-token-requires-marker` rule — Track 3.3 (Face B). Carbon mandatory composite: each component file that references a reserved AI token (`var(--ai-*)`, `--p-color-*-magic*`, `color.ai.*`, `dragon-fruit`, etc.) must render an AI-marker component (AILabel, AIBadge, `magic-*` tag, etc.) or carry an explicit `data-ai` attribute. Missing marker = `error`. Detection is HIGH-confidence only when the token reference is an unambiguous `var(--…)` or bare `--token` form; dot-path heuristic hits are suppressed (LOW confidence). Fast-exit: rule is a no-op when `detectReservedAiTokens` finds zero reserved tokens. Reuses `detectReservedAiTokens` from `parsers/ai-tokens.ts` and `AI_MARKER_NAMES` from `ai-governance/ai-marker-component-present` — no vocabulary redefinition.
- `ai-governance/ai-marker-component-present` rule — Track 3.2 (Face B).
  Detects whether the DS ships a dedicated AI-marker component (Carbon `AILabel`,
  generic `AIBadge` / `AITag` / `AIIndicator` / `AIAvatar`, `GenAI*` variants,
  `*AIMarker*`, Polaris `magic-*`). Scans the export surface (`src/index.ts`,
  `index.ts`, etc.) and component files (`**/*.{tsx,jsx,vue}`) by file name and
  exported identifier. Emits `info` when a marker component is found; emits
  `warning` (cross-condition) when reserved AI tokens exist (via the shared
  `detectReservedAiTokens` parser) but no marker component is detected; emits
  nothing when the DS has no AI surface. Exports `AI_MARKER_NAMES` for reuse by
  sibling rules (Track 3.3 / 3.5). Allowlist via
  `// lyse-disable ai-governance/ai-marker-component-present` in an adjacent
  README or `.lyse.yaml`.
- Registry count-assertion hardening — `registry.test.ts` and `sarif.test.ts`
  no longer hardcode the rule count (was `18`). `registry.test.ts` asserts
  `ruleMap.size === ruleObjects.length`; `sarif.test.ts` derives the expected
  count from `RULE_METADATA.length`. Future rule PRs do not need to touch these
  assertions.
- `ai-governance/ai-tokens-reserved` rule — first rule shipped under the
  `ai-governance` axis (Track 3 / Face B). Inventories reserved AI-marker
  design tokens (Carbon `dragon-fruit` / `*-ai-*`, Polaris `magic`, Workday
  Canvas `*-ai-*`, generic leading-`ai` segment) declared in `tokens.json`,
  `tokens/**/*.json`, `*.tokens.json`, and `**/*.css` `--*` custom
  properties. Severity is `info` — a DS with no AI surface emits no finding
  and is not penalised. The shared parser `detectReservedAiTokens(repoRoot)`
  (exported from `packages/core/src/parsers/ai-tokens.ts`) is reused by the
  downstream gating rule `ai-governance/ai-token-requires-marker` (Track
  3.3). Allowlist via `// lyse-disable ai-governance/ai-tokens-reserved` in
  an adjacent README or `.lyse.yaml`.
- **AI-Governance axis (Face B) plumbing** — added the `ai-governance` scoring
  axis (`AxisName`) and reliability sub-axis label (`AxisLabel`), the foundation
  for the AI-Governance signal family (Track 1 / roadmap §6). The axis is
  additive: `ai-surface` (Face A, AI-Consumable) is unchanged, so the 17 shipped
  rule IDs and the Health Score are untouched. An axis with no rules yet scores
  `N/A` and is excluded from the final average (score-neutral until governance
  rules ship). Locked by a scorer invariant test.
- `ai-surface/mcp-config-present` rule — detects whether a design system
  repository declares an MCP server (Model Context Protocol), signaling
  AI-Consumable readiness. Looks for `.mcp.json` (Claude Code),
  `.cursor/mcp.json` (Cursor), or `claude_desktop_config.json` at the repo
  root and validates each entry has a non-empty key and a `command` string.
  Warning when no config is found; error when present-but-malformed.
  Allowlist via `// lyse-disable ai-surface/mcp-config-present` in the repo
  root README.
- `ai-surface/llms-txt-structure` rule — detects whether the repo ships a
  valid `llms.txt` at its root per the [llmstxt.org](https://llmstxt.org/)
  spec: H1 title, blockquote summary, and at least one `## <section>`
  heading whose list items follow `- [<title>](<url>): <description>`.
  Absence emits a single warning; malformed files emit errors per
  structural issue. Companion `llms-full.txt` is recognised as a bonus
  signal. Allowlist via `lyse-disable ai-surface/llms-txt-structure` in
  the root README.
- `components/contracts-strictness` rule — detects lax component-prop
  contracts that hinder AI-agent code generation:
  - **error** — prop typed `any` / `unknown`.
  - **warning** — variant-like prop (`variant`, `size`, `intent`, `color`,
    `tone`, `appearance`, `kind`) typed plain `string` instead of a
    string-literal union.
  - **warning** — publishable `package.json` missing `types` / `typings`
    or pointing to a non-existent file.

  Framework-allowed props (`children`, `ref`, `key`, `as`, `asChild`) and
  private (`"private": true`) packages are skipped. The variant heuristic
  excludes `type` (overwhelmingly an HTML passthrough, not a DS variant).
- `ai-surface/shadcn-registry-valid` rule — detects whether the design
  system ships a valid shadcn-style component registry (the canonical
  AI-Consumable surface understood by the shadcn CLI and most coding
  agents today). Validates the minimal shadcn schema (`name`, `type`,
  `files`) at canonical locations (`registry.json`,
  `public/registry.json`, `registry/*.json`) with support for single-item
  and collection (`items[]` / `registry[]`) shapes. Warning when
  `components.json` exists but no registry is shipped; errors on
  malformed JSON or missing required fields.
- `ai-surface/agent-instruction-files` rule — detects whether the repo
  ships agent instruction files (`.cursor/rules/*.mdc`, `.cursorrules`,
  `CLAUDE.md`, `.windsurfrules`, `.github/copilot-instructions.md`, etc.)
  that tell coding agents *how* to use the design system. Warning when
  no instruction file is present; warning per file on quality issues
  (too short, missing front-matter for `.mdc`, missing component
  guidance). Allowlist via `lyse-disable
  ai-surface/agent-instruction-files` in the root README.

### Changed

- Promote the 3 AI-Consumable sub-axes (`ai-surface.agents-md-quality`,
  `ai-surface.component-manifest-json`, `ai-surface.ds-index-exported`)
  from `experimental` to `stable` in
  `packages/core/src/reliability/catalogue/sub-axes.ts`. Detection logic
  is unchanged; this is a scoring-status promotion only. Audit Health
  Score is unaffected at v0.1 (the active `scoreFromFindings` scorer is
  axis-weighted and ignores sub-axis status); the change is visible
  through `lyse explain --score` and `docs/architecture/per-rule-slo.md`.
- `tokens/dtcg-conformance` is now a strict W3C DTCG validator. The rule
  walks every leaf token and emits one finding per check:
  - **warning** — leaf has `$value` but no `$type` (with an inferred-type
    suggestion when the value shape is unambiguous).
  - **error** — alias `{group.name}` does not resolve in the document.
  - **error** — `$type: "color"` but `$value` is not a valid CSS color
    (hex / `rgb()` / `hsl()` / `oklch()` / named).
  - **error** — `$type: "dimension"` but `$value` lacks a CSS unit.
  - **error** — `$type: "fontFamily"` but `$value` is not a non-empty
    string or array of strings.
  - **error** — `$type: "fontWeight"` but `$value` is outside `[1, 1000]`
    and not a named weight.
  - **error** — `$type: "duration"` but `$value` is not `<number>(ms|s)`.
  - **error** — `$type: "cubicBezier"` but `$value` is not a 4-number
    array, named easing, or `cubic-bezier()` expression.
  - **error** — `$type: "number"` but `$value` is not a finite number.
  - **warning** — composite tokens (`shadow`, `typography`, `border`,
    `transition`, `gradient`) with malformed `$value` shape.

  Per-token opt-out via the standard DTCG extension mechanism:
  `$extensions.lyse.disable: ["tokens/dtcg-conformance"]` (or `"all"`).
  Implements lyse-labs/lyse-internal#24.

### Changed (BREAKING)

- `tokens/dtcg-conformance`: most type-shape mismatch findings escalate from
  `warning` to `error`. Existing token files with malformed `$value` shapes
  that previously emitted warnings now emit errors. Composite types
  (`shadow`, `typography`, `border`, `transition`, `gradient`) keep `warning`.

### Documentation

- New per-rule page `docs/rules/tokens-dtcg-conformance.md` (Why · How ·
  Examples · Auto-fix · Allowlist · See also).

## [0.1.0-alpha.2] — 2026-06-04

First public release on npm under the scoped name **`@lyse-labs/lyse`**.
The unscoped `lyse` package name on npm was previously claimed by another
publisher and is in tombstone state, so installs use the scoped form:

    npx @lyse-labs/lyse audit
    npm install -g @lyse-labs/lyse

The CLI binary itself is still invoked as `lyse` after install.

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
