import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../../dist/cli.js");

// NOTE: This smoke test spawns a real MCP server subprocess over stdio.
// It is marked .skip on CI (VITEST_SMOKE_MCP=0 or absent) to avoid flakiness
// from process scheduling. To run it locally: VITEST_SMOKE_MCP=1 pnpm test
const runSmoke = process.env["VITEST_SMOKE_MCP"] === "1";

describe("mcp server stdio smoke test", () => {
  (runSmoke ? it : it.skip)("responds to tools/list with at least audit_file", async () => {
    const proc = spawn("node", [cli, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });

    const initRequest =
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }) + "\n";

    const listRequest =
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n";

    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    // Wait for the server to be ready, then send requests
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    proc.stdin.write(initRequest);
    await new Promise<void>((resolve) => setTimeout(resolve, 300));
    proc.stdin.write(listRequest);
    await new Promise<void>((resolve) => setTimeout(resolve, 700));
    proc.kill();

    expect(output).toContain('"name":"audit_file"');
  }, 10_000);

  // This lightweight test verifies the server module loads without error (no subprocess needed).
  // 10s timeout matches the smoke test above — cold imports of the MCP server tree pull in
  // the full rule registry + SDK and can exceed the 5s vitest default on loaded machines.
  it("audit_file tool definition has correct name and required path schema", async () => {
    const { auditFileTool } = await import("../../src/mcp/tools/audit-file.js");
    expect(auditFileTool.name).toBe("audit_file");
    expect(auditFileTool.inputSchema.required).toContain("path");
    expect(auditFileTool.description).toContain("UNSAVED");
  }, 10_000);
});
