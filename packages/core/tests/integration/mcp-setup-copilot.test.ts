import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMcpSetup } from "../../src/commands/mcp-setup.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-mcp-copilot-"));
  mkdirSync(join(dir, ".vscode")); // simulate a VS Code / Copilot project
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("mcp-setup-copilot integration (#98)", () => {
  it("creates .vscode/mcp.json using the `servers` key with a stdio lyse entry", async () => {
    await runMcpSetup({ cwd: dir, target: "copilot", autoApprove: true });
    const path = join(dir, ".vscode/mcp.json");
    expect(existsSync(path)).toBe(true);
    const cfg = JSON.parse(readFileSync(path, "utf8"));
    // VS Code / Copilot use `servers`, not `mcpServers`
    expect(cfg.mcpServers).toBeUndefined();
    expect(cfg.servers?.lyse).toBeDefined();
    expect(cfg.servers.lyse.type).toBe("stdio");
    expect(typeof cfg.servers.lyse.command).toBe("string");
    expect(Array.isArray(cfg.servers.lyse.args)).toBe(true);
  });

  it("is idempotent (second run leaves a single entry, no duplicate)", async () => {
    await runMcpSetup({ cwd: dir, target: "copilot", autoApprove: true });
    await runMcpSetup({ cwd: dir, target: "copilot", autoApprove: true });
    const cfg = JSON.parse(readFileSync(join(dir, ".vscode/mcp.json"), "utf8"));
    expect(Object.keys(cfg.servers)).toEqual(["lyse"]);
  });

  it("preserves a pre-existing unrelated server entry", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, ".vscode/mcp.json"), JSON.stringify({ servers: { other: { command: "x", args: [] } } }));
    await runMcpSetup({ cwd: dir, target: "copilot", autoApprove: true });
    const cfg = JSON.parse(readFileSync(join(dir, ".vscode/mcp.json"), "utf8"));
    expect(cfg.servers.other).toBeDefined();
    expect(cfg.servers.lyse).toBeDefined();
  });
});
