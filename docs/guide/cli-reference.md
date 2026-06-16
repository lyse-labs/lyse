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
| `lyse audit [path]` | Audit a repository; output a Health Score and findings. |
| `lyse fix [path]` | Auto-fix all safe findings (6 safety guards). |
| `lyse share` | Copy a Markdown summary of the last audit to the clipboard. |
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

### Examples

```bash
# Interactive (prompts for everything)
lyse init

# Silent — accept all defaults, no prompts
lyse init --yes
```

## `lyse fix [path]`

Auto-fix all findings that have a safe codemod.

```
lyse fix [path] [options]
```

`path` defaults to `.` (current directory).

### Safety guards

`lyse fix` will abort with an error if any of the following are violated:

1. **Uncommitted changes** — the working tree must be clean (`git status` check).
2. **No git repo** — must be run inside a git repository.
3. **No token map** — at least one design token must be discoverable (`.lyse.yaml` or auto-detection).
4. **Confidence threshold** — only applies codemods with `confidence: high`; skips `medium` and `low` by default.
5. **File count cap** — caps the number of files patched in a single run (default: 200) to avoid runaway changes.
6. **Dry-run by default in non-TTY** — in CI / piped contexts, prints what would change without writing files.

Override the confidence threshold with `--confidence=medium` (experts only).

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--dry-run` | boolean | false (TTY), true (non-TTY) | Print the unified diff without writing files. |
| `--confidence` | `high` \| `medium` | `high` | Minimum codemod confidence to apply. |
| `--rules <list>` | comma-separated | all | Only fix specific rules. |
| `--max-files <n>` | integer | 200 | Abort if more than `n` files would be patched. |

### Examples

```bash
# Fix everything that has a high-confidence codemod
lyse fix

# Preview changes without writing
lyse fix --dry-run

# Fix only token violations
lyse fix --rules=tokens/no-hardcoded-color,tokens/no-hardcoded-spacing

# Include medium-confidence codemods (review carefully)
lyse fix --confidence=medium
```

### Exit codes

- `0` — All applicable fixes applied (or `--dry-run` completed).
- `1` — One or more safety guards blocked the run.
- `2` — Audit failed to run (invalid config, internal error).
- `64` — Invalid arguments.

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

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--format` | `markdown` \| `plain` | `markdown` | Format of the clipboard content. |
| `--top <n>` | integer | 5 | Number of top findings to include. |

## `lyse audit [path]`

Audit a directory.

```
lyse audit [path] [options]
```

`path` defaults to `.` (current directory).

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--format <name>` | `text` \| `json` \| `sarif` | `text` | Output format. |
| `--output <path>` | string | stdout | Write output to a file. |
| `--limit <n>` | integer \| `all` | `10` | Max findings printed by the text/eslint/legacy output. Use `all` or `0` to show every finding. Ignored by `--format=json|sarif` (machine consumers always receive the full report). |
| `--threshold <n>` | integer 0–100 | (none) | Exit code 1 if Health Score is below this value. |
| `--rules <list>` | comma-separated | all | Only run specific rules. |
| `--exclude <list>` | comma-separated | (none) | Skip rules. |

### Examples

```bash
# Default text output
lyse audit

# Machine-readable JSON, written to a file
lyse audit --format=json --output=lyse-report.json

# SARIF for GitHub Security tab
lyse audit --format=sarif --output=lyse.sarif

# Fail CI if score < 70
lyse audit --threshold=70

# Only run the tokens-related rules
lyse audit --rules=tokens/no-hardcoded-color,tokens/no-hardcoded-spacing

# Run everything except Storybook coverage
lyse audit --exclude=stories/coverage

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

The server exposes two tools:

| Tool | Use case |
|---|---|
| `audit_file(path, content?)` | Audit a single file. `content` lets the agent pass an unsaved buffer. |
| `suggest_fix(path, rule_id, line)` | Return a unified diff that fixes a finding. |

Configure in your IDE's MCP file (`.cursor/mcp.json`, `.mcp.json`). See [`mcp-server.md`](./mcp-server.md) for full setup.

## `lyse mcp setup`

Write the MCP config block to your IDE's config file. This is the one-shot alternative to manually editing `.cursor/mcp.json` or `.mcp.json`.

```
lyse mcp setup [options]
```

Detects your IDE automatically (Cursor, Claude Code, VS Code) and appends or merges the `lyse` server entry into the correct config file.

### Options

| Flag | Type | Default | Description |
|---|---|---|---|
| `--ide <name>` | `cursor` \| `claude-code` \| `vscode` | auto-detected | Target IDE. |
| `--global` | boolean | false | Write to the user-level config instead of the project-level config. |
| `--yes` | boolean | false | Overwrite without prompting if conflicting entry exists. |

### Example

```bash
# Auto-detect IDE and write config
lyse mcp setup

# Force Cursor, global config
lyse mcp setup --ide=cursor --global
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

- Vue / Svelte / Solid / Angular: not yet supported. React (TSX/JSX) only.
- styled-components / Emotion / Stitches: partial support; CSS-in-JS via template literals is parsed with Babel. vanilla-extract object styles (`style`, `styleVariants`, `globalStyle`, `recipe` from `@vanilla-extract/css`) are also extracted — the declaration object is serialized to CSS so the same hardcoded-value detectors run over `*.css.ts` files.
- **Tailwind utility classes** (e.g. `bg-blue-500`, `p-4`) are recognized as compliant token references when they reference the project's `tailwind.config` scale. Arbitrary values (e.g. `bg-[#1e293b]`) remain flagged as drift since they bypass the configured scale.
- No HTML report. `lyse audit --format=sarif` emits a SARIF 2.1.0 file you can wire into any SARIF-aware viewer (e.g. by uploading it to GitHub's Security tab via `github/codeql-action/upload-sarif`). Each result carries a stable `partialFingerprints.primaryLocationLineHash/v1` so GitHub deduplicates findings across runs instead of re-creating them; each rule definition carries its measured `properties.precision` when calibrated; and findings dismissed by an inline `lyse-disable` directive are still emitted with an in-source `suppressions[]` entry (kept for trend data rather than dropped).
