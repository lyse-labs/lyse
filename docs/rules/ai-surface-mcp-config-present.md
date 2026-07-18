# `ai-surface/mcp-config-present`

> **Axis:** AI surface · **Severity:** warning (escalates to error on malformed config) · **Auto-fixable:** no · **Version:** v1

Detects whether a design system repository declares at least one MCP (Model Context Protocol) server, signaling AI-Consumable readiness.

## Why

MCP is the de-facto standard for letting coding agents (Claude Code, Cursor, Claude Desktop) call tools that surface a design system's components, tokens, and docs at lookup time. A DS without an MCP server declaration leaves agents to scrape README and source files heuristically — driving the cost-vs-accuracy regression documented in the AI-Consumable track research.

The signal is binary and cheap to enforce: either the repo declares at least one valid `mcpServers` entry or it doesn't. A `warning` (not `info`) reflects the strategic importance of AI-Consumable readiness — shipping a stable MCP surface is table-stakes for a 2026 design system.

Severity escalates to `error` when a config file is present but malformed: a broken `.mcp.json` silently breaks every agent that tries to connect, which is worse than no config at all.

## How it works

The rule looks for an MCP config file at the repo root, in this order:

| Path | Convention |
|---|---|
| `.mcp.json` | Claude Code |
| `.cursor/mcp.json` | Cursor |
| `claude_desktop_config.json` | Claude Desktop (uncommon at repo root, but valid) |

For each file found, it validates:

1. The file is parseable JSON.
2. The root is a JSON object with a top-level `mcpServers` field.
3. `mcpServers` is a non-empty object.
4. Each server entry has a non-empty string key and a `command` (string). `args` (array) is optional.

If any file is malformed at any of those steps, the rule emits an `error`. If no config file is found anywhere, it emits a single `warning`. If at least one config is valid, no finding is emitted.

## Examples

### Good

```json
// .mcp.json
{
  "mcpServers": {
    "lyse": {
      "command": "npx",
      "args": ["@lyse-labs/lyse", "mcp"]
    }
  }
}
```

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "design-system": {
      "command": "node",
      "args": ["./mcp-server.js"]
    }
  }
}
```

### Bad

```json
// .mcp.json — empty mcpServers
{ "mcpServers": {} }
```

```json
// .mcp.json — missing mcpServers
{ "servers": [] }
```

```text
// .mcp.json — not parseable JSON
{ "mcpServers": { "broken":
```

## Allowlist

If your DS legitimately should not declare an MCP server (e.g. it's a primitives-only token library with no surface worth exposing to agents), add the disable directive to your repo root README:

```md
<!-- lyse-disable ai-surface/mcp-config-present -->
```

The directive is matched by substring, so either an HTML comment or a `//` comment will work — anything in `README.md` / `README.mdx` / `readme.md` containing the literal string `lyse-disable ai-surface/mcp-config-present` will suppress the rule.

You can also disable the rule globally in `.lyse.yaml`:

```yaml
rules:
  ai-surface/mcp-config-present: off
```

## What does NOT trigger this rule

- Files larger than 1 MB at the candidate paths — skipped to avoid pathological cases.
- Repos where `repoRoot` is unresolvable — rule is N/A.
- Repos whose README contains the inline `lyse-disable` directive — rule is N/A.

## Related rules

- [`ai-surface/component-manifest-json`](./ai-surface-component-manifest-json.md) — verifies the static component manifest that MCP servers can consume to serve `lyse_components` at ~5× lower cost than reading source.
- [`ai-surface/agents-md-quality`](./ai-surface-agents-md-quality.md) — verifies `AGENTS.md` is command-first.

## See also

- [MCP specification](https://modelcontextprotocol.io)
- [Claude Code MCP docs](https://docs.claude.com/en/docs/agents-and-tools/mcp)
- [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol)
- [Health Score](../guide/health-score.md) — how rules combine into the final score.
