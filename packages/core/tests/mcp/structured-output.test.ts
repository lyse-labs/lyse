import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditFileTool } from "../../src/mcp/tools/audit-file.js";
import { suggestFixTool } from "../../src/mcp/tools/suggest-fix.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../dist/cli.js");

/** Minimal line-delimited JSON-RPC client over the MCP stdio transport. */
function rpcClient(child: ChildProcessWithoutNullStreams) {
  let buf = "";
  const waiters = new Map<number, (msg: unknown) => void>();
  child.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id?: number };
        if (typeof msg.id === "number" && waiters.has(msg.id)) {
          waiters.get(msg.id)!(msg);
          waiters.delete(msg.id);
        }
      } catch {
        /* ignore non-JSON lines */
      }
    }
  });
  return {
    request(id: number, method: string, params: unknown): Promise<any> {
      return new Promise((res, rej) => {
        waiters.set(id, res as (m: unknown) => void);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
        setTimeout(() => rej(new Error(`timeout: ${method}`)), 12_000);
      });
    },
    notify(method: string, params: unknown): void {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
    },
  };
}

describe("MCP structured output (audit-audit P1 #6 / #95)", () => {
  it("both tools declare an outputSchema with the expected required fields", () => {
    expect(auditFileTool.outputSchema?.type).toBe("object");
    expect(auditFileTool.outputSchema?.required).toEqual(["schema_version", "violations"]);
    expect(suggestFixTool.outputSchema?.type).toBe("object");
    expect(suggestFixTool.outputSchema?.required).toContain("patch");
    expect(suggestFixTool.outputSchema?.required).toContain("schema_version");
  });

  let tmp: string;
  let child: ChildProcessWithoutNullStreams;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "lyse-mcp-"));
  });
  afterEach(() => {
    child?.kill();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("audit_file returns structuredContent matching its outputSchema", async () => {
    const file = join(tmp, "Button.tsx");
    writeFileSync(file, `export const Button = () => <button style={{ color: "#ff0000" }} />;\n`);

    child = spawn("node", [CLI, "mcp", "serve"], { stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
    const rpc = rpcClient(child);

    const init = await rpc.request(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "t", version: "0" },
    });
    expect(init.result?.serverInfo?.name).toBe("lyse");
    rpc.notify("notifications/initialized", {});

    const list = await rpc.request(2, "tools/list", {});
    const tools: Array<{ name: string; outputSchema?: unknown }> = list.result.tools;
    expect(tools.find((t) => t.name === "audit_file")?.outputSchema).toBeDefined();

    const call = await rpc.request(3, "tools/call", {
      name: "audit_file",
      arguments: { path: file, project_root: tmp },
    });
    // The SDK validates structuredContent against outputSchema; a mismatch would
    // surface as an error here. We assert the typed object is present + well-formed.
    expect(call.result?.isError).toBeFalsy();
    expect(call.result?.structuredContent?.schema_version).toBe("1.0.0");
    expect(Array.isArray(call.result?.structuredContent?.violations)).toBe(true);

    // Resources capability (#95): list + read the rule contract over MCP.
    const rl = await rpc.request(4, "resources/list", {});
    const uris: string[] = rl.result.resources.map((r: { uri: string }) => r.uri);
    expect(uris).toContain("lyse://rules");
    expect(uris).toContain("lyse://rule/tokens/no-hardcoded-color");

    const rr = await rpc.request(5, "resources/read", { uri: "lyse://rule/tokens/no-hardcoded-color" });
    const meta = JSON.parse(rr.result.contents[0].text);
    expect(meta.id).toBe("tokens/no-hardcoded-color");
  }, 20_000);
});
