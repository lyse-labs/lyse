import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join, dirname } from "node:path";
import { detectFromFilesystem } from "../detection/from-filesystem.js";
import { choice } from "../menu/prompts.js";
import { appendMcpSetupCompletedEvent } from "../history/ndjson-store.js";
import { resolveLyseMcpEntry, detectInstallMode } from "./mcp-entry.js";

interface McpEntry { command: string; args: string[]; type?: string }
// Cursor / Claude Code use `mcpServers`; VS Code / Copilot use `servers`.
interface McpConfig { mcpServers?: Record<string, McpEntry>; servers?: Record<string, McpEntry> }

export type McpTarget = "cursor" | "claude-code" | "copilot" | "both" | "all";

export interface McpSetupOptions {
  cwd: string;
  target?: McpTarget;
  autoApprove?: boolean;
  /** Force absolute-path entry instead of `npx -y lyse mcp`. Auto-detected by default. */
  dev?: boolean;
  /** Override `process.argv[1]` (test seam — see mcp-entry.ts). */
  argv1?: string;
}

async function pathExists(p: string): Promise<boolean> {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

export async function runMcpSetup(opt: McpSetupOptions): Promise<void> {
  const fs = await detectFromFilesystem(opt.cwd);
  const hasCursor = fs.cursor.value;
  const hasClaude = fs.claudeCode.value;
  const hasCopilot = await pathExists(join(opt.cwd, ".vscode")); // VS Code / Copilot

  if (!hasCursor && !hasClaude && !hasCopilot) {
    throw new Error(
      "No IDE detected (.cursor/, .mcp.json, or .vscode/). Configure manually — see docs/guide/mcp-server.md."
    );
  }

  let target = opt.target;
  if (!target) {
    const detected = [
      ...(hasCursor ? [{ title: "Cursor", value: "cursor" as const }] : []),
      ...(hasClaude ? [{ title: "Claude Code", value: "claude-code" as const }] : []),
      ...(hasCopilot ? [{ title: "Copilot (VS Code)", value: "copilot" as const }] : []),
    ];
    if (detected.length === 1) {
      target = detected[0]!.value;
    } else {
      target = await choice(
        "Install in:",
        [...detected, { title: "All detected", value: "all" as const }],
        "all"
      );
    }
  }

  const detectOpts: { argv1?: string; dev?: boolean } = {};
  if (opt.argv1 !== undefined) detectOpts.argv1 = opt.argv1;
  if (opt.dev !== undefined) detectOpts.dev = opt.dev;
  const entry = resolveLyseMcpEntry(detectOpts);
  const isDev = detectInstallMode(detectOpts) === "dev";

  let anyWrite = false;
  if (target === "cursor" || target === "both" || target === "all") {
    const { wrote } = await addEntry(join(opt.cwd, ".cursor/mcp.json"), entry, "mcpServers");
    anyWrite ||= wrote;
    console.log("✓ Added Lyse to .cursor/mcp.json");
  }
  if (target === "claude-code" || target === "both" || target === "all") {
    const { wrote } = await addEntry(join(opt.cwd, ".mcp.json"), entry, "mcpServers");
    anyWrite ||= wrote;
    console.log("✓ Added Lyse to .mcp.json");
  }
  if (target === "copilot" || target === "all") {
    // VS Code / Copilot read `.vscode/mcp.json` under a `servers` key with `type`.
    const { wrote } = await addEntry(join(opt.cwd, ".vscode/mcp.json"), { ...entry, type: "stdio" }, "servers");
    anyWrite ||= wrote;
    console.log("✓ Added Lyse to .vscode/mcp.json");
  }

  if (isDev && anyWrite) {
    console.log("ℹ Dev mode detected — wrote absolute Node path to MCP config.");
  }

  console.log("\nRestart your IDE to activate.\n");

  // Emit telemetry event (opt-in only)
  await appendMcpSetupCompletedEvent(opt.cwd, target);
}

async function addEntry(
  path: string,
  entry: McpEntry,
  key: "mcpServers" | "servers",
): Promise<{ wrote: boolean }> {
  let cfg: McpConfig = {};
  try {
    const raw = await readFile(path, "utf8");
    cfg = JSON.parse(raw) as McpConfig;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code !== "ENOENT") {
      throw new Error(
        `Cannot parse ${path}. Fix the JSON syntax first, then re-run.`
      );
    }
  }
  const servers = (cfg[key] ??= {});

  if (servers.lyse) {
    console.log(`  (Lyse already configured in ${path})`);
    return { wrote: false };
  }

  servers.lyse = entry;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n");
  return { wrote: true };
}
