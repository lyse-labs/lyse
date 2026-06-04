import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../dist/cli.js");

describe("lyse mcp serve", () => {
  it("starts an MCP stdio server that responds to initialize", async () => {
    const child = spawn("node", [CLI, "mcp", "serve"], { stdio: ["pipe", "pipe", "pipe"] });
    try {
      const request =
        JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
          id: 1,
        }) + "\n";

      child.stdin.write(request);

      const response = await new Promise<string>((res, rej) => {
        let buf = "";
        child.stdout.on("data", (chunk: Buffer) => {
          buf += chunk.toString();
          const nl = buf.indexOf("\n");
          if (nl !== -1) res(buf.slice(0, nl));
        });
        child.on("error", rej);
        setTimeout(() => rej(new Error("timeout waiting for MCP response")), 10_000);
      });

      const parsed = JSON.parse(response);
      expect(parsed.result?.serverInfo?.name).toBe("lyse");
    } finally {
      child.kill();
    }
  }, 15_000);
});
