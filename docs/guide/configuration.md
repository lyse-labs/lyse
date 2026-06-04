# Configuration

Lyse runs with sensible defaults out of the box. Add a `.lyse.yaml` at your repo root only when you need to customize behavior.

## File discovery

Lyse looks for configuration in this order:

1. `--config <path>` argument (explicit override).
2. `.lyse.yaml` in the current directory.
3. `.lyse.yaml` in any parent directory (walks up to the git root or filesystem root).

The first match wins.

## Minimal config

```yaml
designSystem:
  componentsModule: "@your-org/ui"
```

That's the most common shape: tell Lyse where your reusable components live, accept defaults for everything else.

## Full schema

```yaml
designSystem:
  componentsModule: "@your-org/ui"
  componentMap:
    "button": "Button"
    "a": "Link"
    "select": "Combobox"
  excludePaths:
    - "packages/legacy/**"
    - "**/*.generated.tsx"
  includePaths:
    - "src/**"
    - "packages/ui/src/**"
  intentMap:
    "submit button": Button
    "dropdown": Combobox
    "modal": Dialog
    "tooltip": Tooltip

rules:
  tokens/no-hardcoded-color:
    severity: warning
    tolerance: 5
  tokens/no-hardcoded-spacing:
    severity: warning
    tolerance: 2
  components/no-native-shadows:
    severity: warning
  a11y/essentials:
    severity: error
    disable:
      - "no-redundant-roles"
  stories/coverage: off
```

## `designSystem`

### `componentsModule`

The npm module that exports your reusable components.

```yaml
designSystem:
  componentsModule: "@your-org/ui"
```

Lyse resolves the module, enumerates its named exports, and maps each to a default native equivalent for the `components/no-native-shadows` rule.

If unset, the `components/no-native-shadows` rule is skipped and the **Components** axis is marked N/A.

Supported forms:
- npm package: `"@your-org/ui"`
- relative path: `"./packages/ui/src"`
- absolute path: `"/path/to/your/ui"`

### `componentMap`

Override the default native-to-component mapping.

```yaml
designSystem:
  componentMap:
    "select": "Combobox"   # use Combobox instead of Select
    "input": "TextField"   # use TextField instead of Input
```

Keys are native HTML tag names (lowercase). Values are the exported names from `componentsModule`.

### `excludePaths`

Glob patterns to skip during scanning.

```yaml
designSystem:
  excludePaths:
    - "packages/legacy/**"
    - "**/*.generated.tsx"
    - "**/node_modules/**"
```

Files under `node_modules/`, `dist/`, `build/`, `coverage/` are excluded by default. You don't need to repeat them.

Globs use [fast-glob](https://github.com/mrmlnc/fast-glob) syntax.

### `includePaths`

If set, Lyse only scans paths matching one of these globs (after `excludePaths` is applied).

```yaml
designSystem:
  includePaths:
    - "src/**"
    - "packages/ui/src/**"
```

If unset, Lyse scans all files except those in `excludePaths` and the default excludes.

## `rules`

### Disabling a rule

```yaml
rules:
  stories/coverage: off
```

Disabled rules contribute zero findings. Their axis is marked N/A and weights renormalize.

### Changing severity

```yaml
rules:
  tokens/no-hardcoded-color:
    severity: error   # default: warning
```

Severities: `error`, `warning`, `info`, `off`.

Severity affects:
- Color in the terminal output.
- SARIF level (`error` / `warning` / `note`).
- `--threshold` interaction: at this time, severity doesn't change the score, but a future version may weight `error` findings more heavily.

### Per-rule options

Some rules accept rule-specific options. See each rule's documentation page in [`./rules/`](../rules/) for the available options.

Common per-rule options:

| Option | Rules | Default | Description |
|---|---|---|---|
| `tolerance` | `tokens/no-hardcoded-color` | 5 | Color-distance threshold for token matching. |
| `tolerance` | `tokens/no-hardcoded-spacing` | 2 | Pixel-distance for token snap. |
| `disable` | `a11y/essentials` | `[]` | Sub-rules to skip (see the rule doc for the list). |
| `componentPaths` | `stories/coverage` | (inferred) | Globs for what counts as a component. |
| `storyExtensions` | `stories/coverage` | `["stories.tsx", "stories.mdx"]` | What counts as a story file. |

## Allowlist directives

Skip a finding inline:

```tsx
// lyse-disable-next-line tokens/no-hardcoded-color
const fallbackColor = "#ff0000";
```

Skip an entire file:

```ts
// lyse-disable tokens/no-hardcoded-color
```

Skip multiple rules:

```ts
// lyse-disable tokens/no-hardcoded-color, a11y/essentials
```

Allowlisted findings still appear in JSON output with `severity: "off"` for transparency, but don't affect the score.

## Per-file overrides via comment frontmatter

Rare but supported: pin per-file rule severities via a frontmatter block at the top of a TSX/JSX file:

```tsx
/**
 * @lyse-overrides
 *   tokens/no-hardcoded-color: error
 *   stories/coverage: off
 */
import React from "react";
```

Use sparingly. Centralized config is preferable.

## Multiple configs in a monorepo

Lyse uses the **deepest** `.lyse.yaml` it finds (walking up from the audit target). If you have:

```
my-monorepo/
├── .lyse.yaml           # root config
├── packages/
│   ├── ui/
│   │   └── .lyse.yaml   # ui-specific config
│   └── legacy/
│       └── .lyse.yaml   # legacy-specific config
```

Running `lyse audit packages/ui` uses `packages/ui/.lyse.yaml`. Running `lyse audit` from the root uses `./.lyse.yaml`.

Configs do **not** merge. Each is self-contained. If you want shared defaults, use YAML anchors or a `$extends` key (planned for v0.2).

## Validating your config

```bash
lyse audit --config=.lyse.yaml --quiet
```

If the config is invalid, Lyse exits with code 2 and a structured error pointing to the offending key. The JSON Schema is published at:

```
schemas/v1/lyse-config.json
```

You can wire this into your editor for inline validation. In VS Code:

```jsonc
// .vscode/settings.json
{
  "yaml.schemas": {
    "https://github.com/lyse-labs/lyse/raw/main/schemas/v1/lyse-config.json": ".lyse.yaml"
  }
}
```

## Examples

### React app with shadcn/ui

```yaml
designSystem:
  componentsModule: "./components/ui"
  excludePaths:
    - "components/ui/**"   # shadcn copy-paste source, don't audit itself
```

### Next.js monorepo

```yaml
designSystem:
  componentsModule: "@acme/ui"
  excludePaths:
    - "apps/legacy/**"
    - "**/*.generated.{ts,tsx}"
  includePaths:
    - "apps/web/**"
    - "apps/admin/**"
    - "packages/features/**"

rules:
  a11y/essentials:
    severity: error
```

### Vite + React app, MUI

```yaml
designSystem:
  componentsModule: "@mui/material"
  componentMap:
    "input": "TextField"
    "select": "Select"
    "button": "Button"
```

### Pure component library

```yaml
designSystem:
  componentsModule: "./src"

rules:
  components/no-native-shadows: off   # the library IS the components
  stories/coverage:
    componentPaths:
      - "src/**/*.tsx"
    storyExtensions:
      - "stories.tsx"
      - "stories.mdx"
```

## LLM provider configuration (optional)

Lyse's optional LLM-assisted features (`lyse init` setup) use a user-supplied LLM. Configure via env vars or `.lyse.yaml`.

### Auto-detection priority

1. `ANTHROPIC_API_KEY` env var → Claude (default model: `claude-sonnet-4-5`)
2. `OPENAI_API_KEY` env var → OpenAI (default: `gpt-4o`)
3. `LYSE_LLM_ENDPOINT` env var → OpenAI-compatible endpoint (Ollama, Together, Groq)
4. MCP host detected (Cursor / Claude Code) → dispatched via MCP tools
5. None → smart features disabled, built-in rules only

### `.lyse.yaml` override

```yaml
llm:
  provider: 'anthropic'      # or 'openai' | 'openai-compatible' | 'mcp' | 'none' | 'auto'
  model: 'claude-sonnet-4-5'
  endpoint: 'http://localhost:11434/v1'  # required for openai-compatible
```

Setting `provider: 'none'` permanently disables LLM features regardless of env vars — useful in privacy-sensitive environments or CI.

### What gets sent

`lyse init` sends ≤ 20 KB total:

- `package.json`
- `tailwind.config.*` if present
- `.storybook/main.*` if present
- Directory tree (top 2 levels, folder names only)
- 5 representative source files (truncated to 5 KB each)

Files under `DEFAULT_EXCLUDE_PATHS` (node_modules, dist, etc.) and `.gitignore` are never sent. Files matching common secret patterns (`.env`, `*.pem`, `*.key`) are excluded.

Run any LLM-calling command with `--dry-run` to preview exactly what would be sent before authorizing.

### Audit log

Every LLM call is logged to `.lyse/llm-calls.jsonl` (git-ignored, per-repo). Each line: timestamp, action, provider, model, tokens, cost, outcome.

```bash
cat .lyse/llm-calls.jsonl | jq
```
