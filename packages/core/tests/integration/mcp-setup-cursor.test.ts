/**
 * Integration test: runMcpSetup — Cursor target.
 *
 * Spawns a real temp directory with a .cursor/ directory present,
 * runs runMcpSetup, and asserts .cursor/mcp.json is created correctly.
 * Also tests idempotency (running twice does not duplicate the entry).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runMcpSetup } from "../../src/commands/mcp-setup.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lyse-int-mcp-"));
  // Simulate a Cursor project by creating .cursor/
  mkdirSync(join(dir, ".cursor"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("mcp-setup-cursor integration", () => {
  it("creates .cursor/mcp.json", async () => {
    await runMcpSetup({ cwd: dir, target: "cursor", autoApprove: true });
    expect(existsSync(join(dir, ".cursor/mcp.json"))).toBe(true);
  });

  it(".cursor/mcp.json contains mcpServers.lyse entry", async () => {
    await runMcpSetup({ cwd: dir, target: "cursor", autoApprove: true });
    const cfg = JSON.parse(readFileSync(join(dir, ".cursor/mcp.json"), "utf8"));
    expect(cfg.mcpServers?.lyse).toEqual({
      command: "npx",
      args: ["-y", "@lyse-labs/lyse", "mcp"],
    });
  });

  it("is idempotent — running twice does not duplicate the entry", async () => {
    await runMcpSetup({ cwd: dir, target: "cursor", autoApprove: true });
    await runMcpSetup({ cwd: dir, target: "cursor", autoApprove: true });
    const cfg = JSON.parse(readFileSync(join(dir, ".cursor/mcp.json"), "utf8"));
    // mcpServers.lyse should be a single object, not an array or duplicated key
    expect(cfg.mcpServers?.lyse).toEqual({
      command: "npx",
      args: ["-y", "@lyse-labs/lyse", "mcp"],
    });
    // Count occurrences of "lyse" as an mcp key in the raw JSON
    const raw = readFileSync(join(dir, ".cursor/mcp.json"), "utf8");
    const matches = (raw.match(/"lyse"\s*:/g) ?? []).length;
    expect(matches).toBe(1);
  });

  it("formats JSON with 2-space indent and trailing newline", async () => {
    await runMcpSetup({ cwd: dir, target: "cursor", autoApprove: true });
    const content = readFileSync(join(dir, ".cursor/mcp.json"), "utf8");
    expect(content).toContain('  "mcpServers"');
    expect(content.endsWith("\n")).toBe(true);
  });

  it("throws when .cursor/ is absent and no other IDE marker present", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "lyse-int-mcp-empty-"));
    try {
      await expect(
        runMcpSetup({ cwd: emptyDir, target: "cursor", autoApprove: true }),
      ).rejects.toThrow(/No IDE detected/);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
