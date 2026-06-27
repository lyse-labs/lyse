# MCP server (internal architecture)

How the Lyse MCP server is wired internally.

> For user-facing MCP setup, see [`docs/guide/mcp-server.md`](../guide/mcp-server.md).
> This page is for contributors / extenders.

## Transport

The MCP server uses **stdio transport** from `@modelcontextprotocol/sdk`:

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server(
  { name: "lyse", version: VERSION },
  { capabilities: { tools: {} } }
);
```

This means:
- The IDE spawns `npx -y lyse mcp` as a child process.
- Communication is JSON-RPC over stdin/stdout.
- One MCP server process serves one IDE session.
- No network listening.

## Server entry

`packages/core/src/mcp/server.ts` is the entry. It:

1. Registers 3 tools: `audit_file`, `suggest_fix`, and `preflight_diff`.
2. Connects the transport.
3. Logs errors to stderr (stdout is reserved for JSON-RPC).
4. Handles SIGTERM / SIGINT gracefully.

```ts
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`[lyse mcp] fatal: ${err}\n`);
  process.exit(1);
});
```

## Tool definitions

Each tool is implemented in `packages/core/src/mcp/tools/<name>.ts` and registered in `server.ts`:

```ts
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS, // auditFileTool, suggestFixTool, preflightDiffTool
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  switch (req.params.name) {
    case "audit_file":     return await auditFileImpl(req.params.arguments);
    case "suggest_fix":    return await suggestFixImpl(req.params.arguments);
    case "preflight_diff": return await preflightDiffImpl(req.params.arguments);
    default: throw new Error(`Unknown tool: ${req.params.name}`);
  }
});
```

## Tool: `audit_file`

`packages/core/src/mcp/tools/audit-file.ts`.

Inputs:
```ts
{
  path: string;
  content?: string;
}
```

Implementation:
1. If `content` is provided, write it to a temporary file (so parsers can operate by path).
2. Resolve the project root (walk up for `.lyse.yaml`).
3. Run the core audit pipeline on the single file.
4. Return findings filtered to the input path.

The core audit is the SAME code path as `lyse audit` — no MCP-specific scoring logic.

## Tool: `suggest_fix`

`packages/core/src/mcp/tools/suggest-fix.ts`.

Inputs:
```ts
{
  path: string;
  rule_id: string;
  line: number;
}
```

Implementation:
1. Run `audit_file` to obtain the current findings for the path.
2. Find the matching finding by `(rule_id, line)`.
3. If the rule is in the codemod registry (`src/codemods/index.ts`), invoke the codemod.
4. Return the unified diff + any imports the codemod needs to add.

If the rule is not auto-fixable, returns a structured error:

```json
{
  "error": "Rule a11y/essentials is not auto-fixable.",
  "suggested_action": "Resolve manually based on the help_uri."
}
```

## Tool: `preflight_diff`

`packages/core/src/mcp/tools/preflight.ts`.

Inputs:
```ts
{
  path: string;
  content: string;        // the full proposed (post-edit) buffer
  project_root?: string;  // defaults to the dir of `path`
}
```

Validates a proposed edit *before* it lands. Lyse audits the proposed `content` and returns a verdict (`pass` | `blocked` | `error`). Only **stable** design-system rules can `block`; experimental-rule violations are returned as `advisory` and never block. Wire it into an agent's pre-write hook as a compiler-style guardrail.

## Concurrency model

A single MCP server process can handle one request at a time. Tool calls are processed sequentially.

For workloads where the IDE wants to fire many `audit_file` calls in parallel, the IDE typically queues them and Lyse processes them FIFO. There's no parallelism within a single MCP process.

## Lifetime

The MCP server runs for the lifetime of the IDE session. The IDE spawns it on session start; it lives until the IDE terminates the process.

Configuration is read once at startup. If the user changes `.lyse.yaml`, they need to restart their IDE session (or the MCP server within it).

This is a known limitation. A future version may watch for config changes and reload automatically.

## Config loading strategy

MCP tool paths use `loadConfig(repoRoot, { onError: "degrade" })` (from `src/config/schema.ts`).

Degrade mode: if `.lyse.yaml` is missing or invalid, the loader returns an empty config and continues — the tool stays useful even with a bad config. This is intentional: an IDE session should not crash because the user has a typo in `.lyse.yaml`.

Contrast with `lyse audit` CLI, which uses the default `{ onError: "throw" }` to surface config errors immediately.

## Logging

The MCP server logs to stderr (never stdout — stdout is the transport):

```ts
function log(msg: string) {
  if (process.env.LYSE_DEBUG === "1") {
    process.stderr.write(`[lyse mcp] ${msg}\n`);
  }
}
```

Errors are logged with full stack traces. Info-level logs only with `LYSE_DEBUG=1`.

## Tests

`packages/core/tests/mcp/` covers:
- Each tool's response shape on valid input.
- Error responses on invalid input.
- Integration: a minimal end-to-end flow.

One subprocess test (`tests/mcp/smoke.test.ts`) is **skipped by default** because it spawns a real `lyse mcp` child process. Maintainers run it manually before releases.

## Adding a tool

To add a new MCP tool:

1. Create `packages/core/src/mcp/tools/<tool-name>.ts` exporting:
   - A `Tool` definition with `name`, `description`, `inputSchema` (JSON Schema).
   - An implementation function.
2. Register in `server.ts` (`ListToolsRequestSchema` and `CallToolRequestSchema` handlers).
3. Document in `docs/guide/mcp-server.md` (user-facing).
4. Update `packages/core/src/reporters/markdown.ts` to include the new tool in generated `AGENTS.md`.
5. Test in `packages/core/tests/mcp/<tool-name>.test.ts`.

The new tool should follow the same patterns:
- Inputs validated with JSON Schema (the MCP SDK handles this when the schema is correct).
- Implementation is deterministic.
- No network calls.
- Errors are structured, not thrown.

## See also

- [`docs/guide/mcp-server.md`](../guide/mcp-server.md) — user-facing setup.
- [Model Context Protocol spec](https://modelcontextprotocol.io/).
- [`overview.md`](./overview.md) — where the MCP server fits.
- `packages/core/src/mcp/` — implementation.
