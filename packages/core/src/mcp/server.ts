import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "../index.js";
import { auditFileTool, runAuditFile } from "./tools/audit-file.js";
import { suggestFixTool, runSuggestFix } from "./tools/suggest-fix.js";
import { preflightTool, runPreflight } from "./tools/preflight.js";
import { listResources, readResource } from "./resources.js";

const TOOL_DEFINITIONS: Tool[] = [auditFileTool, suggestFixTool, preflightTool];

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: "lyse",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  // Resources expose the rule contract (read-only) so an agent can read the
  // design-system rules, not just call the audit tools. See ./resources.ts.
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const contents = readResource(request.params.uri);
    if (contents === null) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
    return { contents };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // Each tool declares an `outputSchema`, so the result carries both
    // `structuredContent` (the typed object, validated against the schema by
    // the SDK) and a `content` text mirror for clients that don't yet read
    // structured output. Per MCP spec the two must be consistent.
    if (name === "audit_file") {
      const result = await runAuditFile(args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
    if (name === "suggest_fix") {
      const result = await runSuggestFix(args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
    if (name === "preflight_diff") {
      const result = await runPreflight(args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
