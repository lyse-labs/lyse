import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { detectFromFilesystem } from "../detection/from-filesystem.js";
import { choice } from "../menu/prompts.js";
import { appendMcpSetupCompletedEvent } from "../history/ndjson-store.js";
import { resolveLyseMcpEntry, detectInstallMode } from "./mcp-entry.js";

interface McpConfig {
  mcpServers?: Record<string, { command: string; args: string[] }>;
}

export interface McpSetupOptions {
  cwd: string;
  target?: "cursor" | "claude-code" | "both";
  autoApprove?: boolean;
  /** Force absolute-path entry instead of `npx -y lyse mcp`. Auto-detected by default. */
  dev?: boolean;
  /** Override `process.argv[1]` (test seam — see mcp-entry.ts). */
  argv1?: string;
}

export async function runMcpSetup(opt: McpSetupOptions): Promise<void> {
  const fs = await detectFromFilesystem(opt.cwd);
  const hasCursor = fs.cursor.value;
  const hasClaude = fs.claudeCode.value;

  if (!hasCursor && !hasClaude) {
    throw new Error(
      "No IDE detected (.cursor/ or .mcp.json). Configure manually — see docs/guide/mcp-server.md."
    );
  }

  let target = opt.target;
  if (!target) {
    if (hasCursor && hasClaude) {
      target = await choice(
        "Install in:",
        [
          { title: "Cursor only", value: "cursor" as const },
          { title: "Claude Code only", value: "claude-code" as const },
          { title: "Both", value: "both" as const },
        ],
        "both"
      );
    } else {
      target = hasCursor ? "cursor" : "claude-code";
    }
  }

  const detectOpts: { argv1?: string; dev?: boolean } = {};
  if (opt.argv1 !== undefined) detectOpts.argv1 = opt.argv1;
  if (opt.dev !== undefined) detectOpts.dev = opt.dev;
  const entry = resolveLyseMcpEntry(detectOpts);
  const isDev = detectInstallMode(detectOpts) === "dev";

  let anyWrite = false;
  if (target === "cursor" || target === "both") {
    const { wrote } = await addEntry(join(opt.cwd, ".cursor/mcp.json"), entry);
    anyWrite ||= wrote;
    console.log("✓ Added Lyse to .cursor/mcp.json");
  }
  if (target === "claude-code" || target === "both") {
    const { wrote } = await addEntry(join(opt.cwd, ".mcp.json"), entry);
    anyWrite ||= wrote;
    console.log("✓ Added Lyse to .mcp.json");
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
  entry: { command: string; args: string[] },
): Promise<{ wrote: boolean }> {
  let cfg: McpConfig = { mcpServers: {} };
  try {
    const raw = await readFile(path, "utf8");
    cfg = JSON.parse(raw) as McpConfig;
    cfg.mcpServers ??= {};
  } catch (err) {
    const e = err as { code?: string };
    if (e.code !== "ENOENT") {
      throw new Error(
        `Cannot parse ${path}. Fix the JSON syntax first, then re-run.`
      );
    }
  }

  if (cfg.mcpServers!.lyse) {
    console.log(`  (Lyse already configured in ${path})`);
    return { wrote: false };
  }

  cfg.mcpServers!.lyse = entry;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n");
  return { wrote: true };
}
