import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "../index.js";
import { auditFileTool, runAuditFile } from "./tools/audit-file.js";
import { suggestFixTool, runSuggestFix } from "./tools/suggest-fix.js";

const TOOL_DEFINITIONS: Tool[] = [auditFileTool, suggestFixTool];

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: "lyse",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

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
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
