# CLI reference

Every command, every flag, every environment variable.

## Synopsis

```
lyse <command> [options]
```

Commands:

| Command | Description |
|---|---|
| `lyse init` | Interactive setup wizard — detect framework, generate `.lyse.yaml`, wire IDE. |
| `lyse install [path]` | One-command onboarding — install the Lyse skill into every detected coding agent + the advisory pre-commit hook. |
| `lyse audit [path]` | Audit a repository; output a Health Score and findings. |
| `lyse handoff [path]` | Audit, then hand the findings to your coding agent (Claude Code, Cursor, Codex) to fix. |
| `lyse fix [path]` | Deprecated — redirects to `lyse handoff`. |
| `lyse add ci-gate \| git-hook` | Scaffold a CI gate workflow or an advisory pre-commit hook. |
| `lyse share` | Copy a Markdown summary of the last audit to the clipboard. |
| `lyse badge` | Print a shields.io Health Score badge for your README. |
| `lyse explain <rule-id>` | Print rule rationale, examples, allowlist guidance. |
| `lyse agents` | Generate an `AGENTS.md` summary for AI coding agents. |
| `lyse mcp` | Start the MCP server over stdio (called by your IDE). |
| `lyse mcp setup` | Write the MCP config block to your IDE's config file. |
| `lyse feedback --missed <file>:<line>` | Submit a missed-finding signal (opt-in; per-call confirmation). |
| `lyse telemetry on \| off \| status` | Inspect or change persisted telemetry consent. |
| `lyse bench-pack` | Emit a deterministic evidence pack (JSON) for submission to the public benchmark (backend not yet live). |
| `lyse version` | Print the installed version. |

Global options:

| Flag | Description |
|---|---|
| `--help` | Print usage and exit. |
| `--quiet` | Suppress informational output (errors still print). |
| `--config <path>` | Use a config file other than `.lyse.yaml`. |
| `--no-color` | Disable ANSI color in terminal output. |
| `--yes` | Accept all interactive prompts with their default values. |
| `--no-prompt` | Refuse all interactive prompts; error if a prompt would be required. |

## `lyse init`

Interactive setup wizard. Run it once when you first add Lyse to a project.

```
lyse init
```

The wizard:

1. **Detects your stack** — framework (React, Vue, Svelte, …), components module, Storybook presence, IDE (Cursor, VS Code, …).
2. **Generates `.lyse.yaml`** — pre-filled with the detected settings; prompts before writing.
3. **Wires IDE MCP** — offers to write the MCP config block (same as `lyse mcp setup`).
4. **Runs a first audit** — shows the baseline Health Score.

Accepts `--yes` to skip all confirmation prompts (auto-accept defaults).

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--yes` | boolean | `false` | Accept all prompts with their defaults (non-interactive). |
| `--scaffold` | boolean | `false` | Generate missing AI-readiness files (`llms.txt`, `AGENTS.md`, value-gate doc). Idempotent. |
| `--migrate-tokens` | boolean | `false` | Migrate legacy (`{ value, type }`) token JSON to DTCG (`{ $value, $type }`); skips files that wouldn't be conformant. |

### Examples

```bash
# Interactive (prompts for everything)
lyse init

# Silent — accept all defaults, no prompts
lyse init --yes

# Set up + generate any missing AI-readiness files
lyse init --scaffold

# Set up + convert legacy token JSON to DTCG
lyse init --migrate-tokens
```

## `lyse handoff [path]`

Audit, then hand the findings to your coding agent to fix. **Lyse never edits your code itself** — `handoff` produces the fix payload and launches the agent you already use (Claude Code, Cursor, Codex), which edits the working tree.

```
lyse handoff [path]
```

`path` defaults to `.` (current directory). Needs an interactive terminal.

### What it does

1. **Audits** the repo (same as `lyse audit`).
2. **Writes the handoff payload** to `.lyse/handoff/` — `findings.json` (every finding) + `tokens.json` (your full token map).
3. **Groups findings by drift class** with the resolved token mapping (e.g. `#3b82f6 → color/brand/primary`), so the agent applies one consistent decision across every site instead of inventing N divergent ones.
4. **Prompts you to pick an agent** (or copy the prompt to your clipboard), installs the Lyse skill into it, and **launches it** on the payload. Your choice is remembered for next time.

The agent edits the **working tree only** — it never commits or opens a PR, so you review the diff before anything is permanent. When it's done, run `lyse audit` (or `lyse handoff` again) to confirm the score went up.

> **Trust boundary.** `lyse handoff` launches your coding agent with its permission prompts bypassed so it can apply fixes unattended. Only run it on repositories you trust.

> **`lyse fix` is retired.** Lyse no longer applies codemods itself — `lyse fix` prints a notice and redirects here. Its two non-fix extras moved to the setup wizard: `lyse init --scaffold` and `lyse init --migrate-tokens`.

### Exit codes

- `0` — Audit completed; payload written and the agent launched, prompt copied, or handoff skipped.
- `1` — The audit refused to run (no LLM connector when one was required).

## `lyse share`

Copy a Markdown summary of the last `lyse audit` run to your clipboard.

```
lyse share
```

The clipboard content includes:

- The Health Score and per-axis breakdown.
- Top findings (rule ID, file, line).
- A timestamp and the Lyse version.

Useful for pasting into a Slack message, PR description, or a team retrospective note.

If no recent audit exists in `.lyse/history.ndjson`, Lyse runs a fresh `lyse audit` before sharing.

`lyse share` takes a `[path]` positional plus the global flags; it has no command-specific options.

## `lyse badge [path]`

Audit, then print a [shields.io](https://shields.io) Health Score badge you can paste into your README.

```
lyse badge
```

Prints a ready-to-paste Markdown badge with your score, grade, and a colour band
(A → brightgreen, B → green, C → yellow, Fail → red):

```markdown
[![Lyse Health Score](https://img.shields.io/badge/Lyse-82%2F100_(A)-brightgreen)](https://github.com/owner/repo)
```

The static badge is frozen at generation. For an **auto-updating** badge, use
`--write`: it writes `.lyse/badge.json` (a shields.io endpoint document) and prints
the matching Markdown. Commit `.lyse/badge.json` and refresh it in CI
(`lyse badge --write`) — the badge then reflects your latest score on every run.

The score is computed locally and embedded in the URL/JSON **you** commit;
shields.io is fetched by your README's viewer, never by Lyse. Nothing leaves your machine.

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--write` | boolean | `false` | Also write `.lyse/badge.json` (auto-updating endpoint) + print its Markdown. |

## `lyse audit [path]`

Audit a directory.

```
lyse audit [path] [options]
```

`path` defaults to `.` (current directory).

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--format <name>` | `text` \| `json` \| `sarif` \| `html` | `text` | Output format. `html` emits a self-contained, shareable report. |
| `--output <path>` | string | stdout | Write output to a file. |
| `--limit <n>` | integer \| `all` | `10` | Max findings printed by the text/eslint/legacy output. Use `all` or `0` to show every finding. Ignored by `--format=json|sarif` (machine consumers always receive the full report). |
| `--threshold <n>` | integer 0–100 | (none) | Exit code 1 if Health Score is below this value. |
| `--scope <mode>` | `changed` \| `staged` \| `uncommitted` | (whole tree) | Limit the audit to git-changed files. `changed` = committed vs `--base` (PR review); `staged` = files in the index (pre-commit); `uncommitted` = working-tree edits + untracked (verify an agent's uncommitted fixes). |
| `--staged` | boolean | `false` | Shortcut for `--scope=staged` (audit only staged files — ideal for pre-commit hooks). |
| `--base <ref>` | git ref | `origin/main` | Base ref for `--scope=changed`. |
| `--verbose` | boolean | `false` | Show all findings (default: top 5 in text output). |
| `--static-only` | boolean | `false` | Skip Layer 4 LLM augmentation; report the static-only score (~30% coverage). |
| `--dim <axis>` | string | (all) | Focus the LLM audit on a single axis (`tokens`, `a11y`, `components`, `stories`, `ai-surface`). |
| `--cost-cap-usd <n>` | number | `$5` local / `$1` CI | Abort if projected LLM cost exceeds this amount. |
| `--no-cache` | boolean | `false` | Ignore the LLM cache; force a fresh LLM call. |
| `--interactive` | boolean | `false` | After the audit, prompt per finding (`y/n/?/s/q`); verdicts are sent to feedback only with `lyse telemetry on`. |
| `--render` | boolean | `false` | Opt-in: render the design system in headless Chromium (token-fidelity drift + axe-core a11y on a pre-built Storybook). Requires Playwright. |
| `--storybook <dir\|url>` | string | (none) | Storybook source for runtime a11y — a pre-built static dir (e.g. `storybook-static`) or a running URL. Used only with `--render`. |
| `--llm` / `--no-llm` | boolean | (off) | Enable / disable the LLM precision filter for this run. `--llm` is opt-in and sends source to your configured provider; `--no-llm` forces static-only. |
| `--llm-provider <name>` | string | (config) | Override the LLM provider (`anthropic` \| `openai` \| `openai-compat` \| `ollama`). |
| `--llm-model <name>` | string | (config) | Override the LLM model. |
| `--include-timestamps` | boolean | `false` | Include a timestamp in JSON output. Breaks byte-for-byte determinism. |

### Examples

```bash
# Default text output
lyse audit

# Machine-readable JSON, written to a file
lyse audit --format=json --output=lyse-report.json

# SARIF for GitHub Security tab
lyse audit --format=sarif --output=lyse.sarif

# Self-contained shareable HTML report
lyse audit --format=html --output=lyse-report

# Fail CI if score < 70
lyse audit --threshold=70

# Show every finding (no truncation)
lyse audit --verbose

# Show the top 50 findings instead of the default 10
lyse audit --limit=50

# Print every finding (no truncation)
lyse audit --limit=all
```

### Exit codes

- `0` — Audit completed; score met threshold (if specified).
- `1` — Audit completed; score below threshold.
- `2` — Audit could not run (invalid config, unreadable files, internal error).
- `64` — Invalid arguments.

### JSON output: `meta.coverage`

Audit-perimeter signals so the Health Score has a visible denominator.

**Deterministic fields — always present in default output:**

| Field | Type | Description |
|---|---|---|
| `scannedFiles` | `number` | Count of source files actually walked by the scanner. NOT a generic `find` of the repo — files excluded by `.lyseignore` or config patterns are excluded. |
| `configPath` | `string \| null` | Absolute path to the resolved `.lyse.yaml`, or `null` when no config file was discovered. Respects the `LYSE_CONFIG_PATH` env var. |

**Non-deterministic fields — stripped by default, exposed with `--include-timestamps`:**

| Field | Type | Description |
|---|---|---|
| `durationMs` | `number` | Audit pipeline wall time in milliseconds. Excludes Node boot and CLI argument parsing. Varies run-to-run by definition. |

The default JSON output is byte-identical across two runs on the same repo
state — the determinism contract ("Same input → same output") is preserved.
`--include-timestamps` opts into the full meta (wallclock + LLM metadata) for
debugging or telemetry use cases.

The text format (`--format=text`) always shows the duration in its footer
since text is for human consumption, not snapshot diffing.

`parseErrors[]`, `exclusions[]`, and `filesByExtension` are planned additions
to `meta.coverage` once the scanner pipeline exposes them.

### Interactive menu (TTY mode)

After a successful audit in an interactive terminal, Lyse shows a quick-action menu:

```
  What next? (fix / share / explain <rule> / quit)
```

This menu is suppressed in CI and non-TTY contexts (`CI=1`, piped output).

## `lyse install [path]`

One-command onboarding. Installs the Lyse skill into every detected coding agent (Claude Code, Cursor, Codex, OpenCode) so it knows how to fix drift, and installs the advisory pre-commit hook (`lyse add git-hook`). Resilient: outside a git repo, the skill still installs and the hook is reported as skipped.

| Flag | Type | Default | Description |
|---|---|---|---|
| `--lyse-version <v>` | string | running CLI version | Pin the Lyse version the hook uses. |
| `--force` | boolean | `false` | Replace a pre-existing pre-commit hook. |

Next: `lyse audit` to see your health, then `lyse handoff` to have your agent fix the issues.

## `lyse add <feature>`

Scaffold a Lyse integration into your repo.

### `lyse add ci-gate [path]`

Writes a GitHub Actions workflow (`.github/workflows/lyse.yml` + `.github/scripts/lyse-gate.mjs`) that audits every PR, posts a score-regression comment, and includes an advisory step surfacing the new drift on the PR's changed files (`--scope changed`).

| Flag | Type | Default | Description |
|---|---|---|---|
| `--threshold <n>` | integer | `0` | Max allowed score drop before the gate fails. |
| `--lyse-version <v>` | string | running CLI version | Pin the Lyse version the workflow uses. |
| `--force` | boolean | `false` | Overwrite existing files. |

### `lyse add git-hook [path]`

Installs a pre-commit hook (`.git/hooks/pre-commit`) that runs `lyse audit --staged` to surface design-system drift in staged files before each commit. **Advisory only** — it never blocks the commit (bypass with `git commit --no-verify`). Refuses to overwrite a pre-existing hook unless `--force`.

| Flag | Type | Default | Description |
|---|---|---|---|
| `--lyse-version <v>` | string | running CLI version | Pin the Lyse version the hook uses. |
| `--force` | boolean | `false` | Replace a pre-existing pre-commit hook. |

## `lyse explain <rule-id>`

Print a human-readable explanation of a rule.

```
lyse explain tokens/no-hardcoded-color
```

Output includes:

- Rule ID + version
- Axis
- Severity
- Rationale
- Good and bad code examples
- Allowlist directive syntax
- Link to the full rule documentation page (helpUri)

This is also available via `npm view lyse@latest` metadata, but `lyse explain` works fully offline once installed.

## `lyse explain --score`

Print a Lighthouse-style breakdown of the Health Score for the current repo: the
score + scoring version, counted vs reported-only findings, the per-sub-axis
penalty breakdown, the AI-Governance Maturity level (L0–L5, Kavcic-aligned), and
a **gap report** ("How to improve"):

- **Score** — the counted (stable) sub-axes ranked by penalty, each with the
  approximate Health-Score points recovered if cleared (`~+N pts`). Only counted
  sub-axes appear, so fixing them genuinely moves the score.
- **Maturity** — the concrete affordances needed to climb one Kavcic rung
  (e.g. `L2 → L3 needs an AI interaction affordance — …`), or a note when at the
  statically-detectable ceiling (L4).

Kavcic maturity is reported as **one lens**; HAX / PAIR remain the ground-truth
anchors. The output is deterministic (same repo → same report).

## `lyse agents`

Generate an `AGENTS.md` file that summarizes your design system rules for AI coding agents.

```
lyse agents > AGENTS.md
```

The generated file:

- Lists all enabled rules with one-line descriptions.
- Names the components module from `.lyse.yaml`.
- Includes the intent map.
- Names the auto-fixable rules so the agent prefers them.

Commit `AGENTS.md` to your repo. Cursor, Claude Code, and similar tools read it on session start.

> **Deprecated alias:** `lyse agents-md` still works but is deprecated. Use `lyse agents` going forward.

## `lyse mcp`

Start the MCP server over stdio. This is normally invoked by your IDE, not directly from a terminal.

```
lyse mcp
```

The server exposes three tools:

| Tool | Use case |
|---|---|
| `audit_file(path, content?)` | Audit a single file. `content` lets the agent pass an unsaved buffer. |
| `suggest_fix(path, rule_id, line)` | Return a unified diff that fixes a finding. |
| `preflight_diff(path, content)` | Validate a proposed edit *before* it lands, with a block/pass verdict. |

Configure in your IDE's MCP file (`.cursor/mcp.json`, `.mcp.json`). See [`mcp-server.md`](./mcp-server.md) for full setup.

## `lyse mcp setup`

Write the MCP config block to your IDE's config file. This is the one-shot alternative to manually editing `.cursor/mcp.json` or `.mcp.json`.

```
lyse mcp setup [options]
```

Detects your IDE automatically (Cursor, Claude Code, Copilot) and appends or merges the `lyse` server entry into the correct config file.

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--target <name>` | `cursor` \| `claude-code` \| `copilot` \| `both` \| `all` | auto-detected | Which IDE config(s) to write. |
| `--dev` | boolean | auto-detected | Force an absolute-path server entry (auto-detected when running from a local build). |
| `--yes` | boolean | false | Overwrite without prompting if a conflicting entry exists. |

### Example

```bash
# Auto-detect IDE and write config
lyse mcp setup

# Force Cursor
lyse mcp setup --target=cursor
```

## `lyse telemetry`

Inspect or change the persisted telemetry consent recorded in `~/.lyse/consent.json`. Consent is asked once on the first `lyse audit` (max 2 prompts lifetime, default-N, audit runs identically either way). These subcommands let you change your mind at any time — required by GDPR Art. 7(3) (withdrawal as easy as granting).

```
lyse telemetry on       # enable telemetry (writes accepted: true)
lyse telemetry off      # disable telemetry (writes accepted: false)
lyse telemetry status   # print current state
```

Discoverable, not paraded — same posture as `npm config set send-metrics false`. See [`PRIVACY.md`](../../PRIVACY.md) for the full data-flow disclosure.

### `lyse audit --no-telemetry`

Per-run override that suppresses telemetry for the current invocation only. Does **not** touch `~/.lyse/consent.json`. Use it when you want a one-off audit without sending events, without flipping the persisted decision.

## `lyse version`

Print the installed version.

```
lyse version
```

Same as `lyse --version` (short form).

## Environment variables

| Variable | Effect |
|---|---|
| `LYSE_LICENSE_KEY=<jwt>` | License JWT for entitled features (commercial-license users). |
| `LYSE_DEBUG=1` | Verbose logging to stderr. Useful for bug reports. |
| `LYSE_NO_UPDATE_CHECK=1` | Skip the once-per-day check for a newer version. |
| `NO_COLOR=1` | Standard convention: disable ANSI color output. |
| `CI=1` | Standard convention: Lyse adjusts text output for CI logs (no progress spinners). |

## Configuration discovery

Lyse looks for configuration in this order:

1. `--config <path>` argument (explicit).
2. `.lyse.yaml` in the current directory.
3. `.lyse.yaml` in any parent directory (walks up to the git root or filesystem root).
4. No configuration (uses defaults).

If multiple parent directories have `.lyse.yaml`, the deepest one wins.

## .lyse.yaml shape

See [`configuration.md`](./configuration.md) for the full schema. Quick reference:

```yaml
designSystem:
  componentsModule: "@your-org/ui"
  excludePaths:
    - "packages/legacy/**"
  intentMap:
    "submit button": Button
    "dropdown": Combobox

rules:
  tokens/no-hardcoded-color:
    severity: warning
    tolerance: 5
  stories/coverage: off
```

## Performance

On a typical project (500–2000 source files):

| Step | Time |
|---|---|
| Cold install (`npx @lyse-labs/lyse@latest`) | 3–8 seconds |
| First audit | 2–5 seconds |
| Cached re-audit | < 1 second |
| MCP `audit_file` per call | 50–200 ms |

Larger monorepos (10k+ files) scale linearly. If your audit takes longer than 30 seconds, please [file an issue](https://github.com/lyse-labs/lyse/issues/new/choose) with the file count and a flame graph if possible.

## Output stability

The Health Score is deterministic: same input, same lyse version, same config → same score.

JSON and SARIF outputs sort keys and findings (by file, then line, then column). Diffs across runs reflect real changes, not output noise.

## Programmatic usage

Lyse is also published as a library:

```ts
import { audit } from "lyse";

const result = await audit({
  rootDir: "/path/to/repo",
  configPath: ".lyse.yaml",
});

console.log(result.finalScore);       // 67
console.log(result.findings.length);  // 23
```

See [`packages/core/README.md`](../../packages/core/README.md) for the full library API.

## Known limitations

- **Component frameworks:** React (TSX/JSX) has full coverage (a11y, naming, contracts, stories). **Svelte (`.svelte`) and Vue (`.vue`) single-file components are scanned at the *style* level** — their `<style>` blocks are extracted so the token-drift detectors (color, spacing, radius, …) cover them. Their template/script a11y + naming parity is not yet wired (follow-up). Angular component styles in separate `.css`/`.scss` files are already covered; Solid is not yet supported.
- styled-components / Emotion / Stitches: partial support; CSS-in-JS via template literals is parsed with Babel. vanilla-extract object styles (`style`, `styleVariants`, `globalStyle`, `recipe` from `@vanilla-extract/css`) are also extracted — the declaration object is serialized to CSS so the same hardcoded-value detectors run over `*.css.ts` files.
- **Tailwind utility classes** (e.g. `bg-blue-500`, `p-4`) are recognized as compliant token references when they reference the project's `tailwind.config` scale. Arbitrary values (e.g. `bg-[#1e293b]`) remain flagged as drift since they bypass the configured scale.
- **Token sources discovered:** Tailwind (v3 config + v4 `@theme`), DTCG (`*.tokens.json` with `$value`/`$type`), **Style Dictionary** (`{ "value", "type" }`), **Tokens Studio** (`$metadata`/`$themes` + TS type names), and **Figma Variables** (via their committed DTCG / Tokens-Studio export). The first source with a non-empty token map wins.
- `lyse audit --format=html` emits a self-contained HTML report (inline CSS, no external requests) — a shareable, screenshot-able snapshot of the score, axes, and findings. For machine/CI integration, `lyse audit --format=sarif` emits a SARIF 2.1.0 file you can wire into any SARIF-aware viewer (e.g. by uploading it to GitHub's Security tab via `github/codeql-action/upload-sarif`). Each result carries a stable `partialFingerprints.primaryLocationLineHash/v1` so GitHub deduplicates findings across runs instead of re-creating them; each rule definition carries its measured `properties.precision` when calibrated; and findings dismissed by an inline `lyse-disable` directive are still emitted with an in-source `suppressions[]` entry (kept for trend data rather than dropped).
