import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMcpSetup } from "../../src/commands/mcp-setup.js";

const NPM_ARGV1 = "/some/path/node_modules/lyse/dist/cli.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-mcp-"));
});

describe("runMcpSetup", () => {
  it("throws when no IDE detected", async () => {
    await expect(
      runMcpSetup({ cwd: dir, autoApprove: true, argv1: NPM_ARGV1 })
    ).rejects.toThrow(/No IDE detected/);
  });

  it("creates .cursor/mcp.json when only Cursor present", async () => {
    mkdirSync(join(dir, ".cursor"));
    await runMcpSetup({
      cwd: dir,
      autoApprove: true,
      argv1: NPM_ARGV1,
    });
    const path = join(dir, ".cursor/mcp.json");
    expect(existsSync(path)).toBe(true);
    const cfg = JSON.parse(readFileSync(path, "utf8"));
    expect(cfg.mcpServers.lyse).toEqual({
      command: "npx",
      args: ["-y", "@lyse-labs/lyse", "mcp"],
    });
  });

  it("creates .mcp.json when only Claude Code present", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{}");
    await runMcpSetup({ cwd: dir, target: "claude-code", autoApprove: true, argv1: NPM_ARGV1 });
    const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    expect(cfg.mcpServers.lyse).toBeDefined();
  });

  it("preserves existing mcpServers entries", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { existing: { command: "echo", args: ["hi"] } },
      })
    );
    await runMcpSetup({ cwd: dir, target: "claude-code", autoApprove: true, argv1: NPM_ARGV1 });
    const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    expect(cfg.mcpServers.existing).toEqual({ command: "echo", args: ["hi"] });
    expect(cfg.mcpServers.lyse).toBeDefined();
  });

  it("skips if Lyse already configured (idempotent)", async () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          lyse: { command: "npx", args: ["-y", "@lyse-labs/lyse", "mcp"] },
        },
      })
    );
    await runMcpSetup({ cwd: dir, target: "claude-code", autoApprove: true, argv1: NPM_ARGV1 });
    const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    expect(cfg.mcpServers.lyse).toBeDefined();
  });

  it("refuses on malformed JSON", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{ broken json");
    await expect(
      runMcpSetup({ cwd: dir, target: "claude-code", autoApprove: true, argv1: NPM_ARGV1 })
    ).rejects.toThrow(/Cannot parse/);
  });

  it("installs to both when target=both", async () => {
    mkdirSync(join(dir, ".cursor"));
    writeFileSync(join(dir, ".mcp.json"), "{}");
    await runMcpSetup({ cwd: dir, target: "both", autoApprove: true, argv1: NPM_ARGV1 });
    const cursorCfg = JSON.parse(readFileSync(join(dir, ".cursor/mcp.json"), "utf8"));
    const claudeCfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    expect(cursorCfg.mcpServers.lyse).toBeDefined();
    expect(claudeCfg.mcpServers.lyse).toBeDefined();
  });

  it("formats JSON with 2-space indent", async () => {
    mkdirSync(join(dir, ".cursor"));
    await runMcpSetup({ cwd: dir, target: "cursor", autoApprove: true, argv1: NPM_ARGV1 });
    const content = readFileSync(join(dir, ".cursor/mcp.json"), "utf8");
    expect(content).toContain('  "mcpServers"');
    expect(content.endsWith("\n")).toBe(true);
  });

  it("writes a node + absolute-path entry when dev mode is forced", async () => {
    writeFileSync(join(dir, ".mcp.json"), "{}");
    await runMcpSetup({
      cwd: dir,
      target: "claude-code",
      autoApprove: true,
      dev: true,
      argv1: "/path/to/lyse-dev/packages/core/dist/cli.js",
    });
    const cfg = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf8"));
    expect(cfg.mcpServers.lyse).toEqual({
      command: "node",
      args: ["/path/to/lyse-dev/packages/core/dist/cli.js", "mcp"],
    });
  });
});
