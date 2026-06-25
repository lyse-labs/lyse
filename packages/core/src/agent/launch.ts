import { spawn } from "node:child_process";
import { isCommandAvailable } from "./registry.js";
import type { AgentId } from "./registry.js";

export interface LaunchArgs {
  binary: string;
  bypassFlags: string[];
  launchSupported: boolean;
}

const LAUNCH_MAP: Record<AgentId, LaunchArgs> = {
  "claude-code": { binary: "claude", bypassFlags: ["--dangerously-skip-permissions"], launchSupported: true },
  codex: { binary: "codex", bypassFlags: ["--yolo"], launchSupported: true },
  cursor: { binary: "cursor-agent", bypassFlags: ["--force"], launchSupported: true },
  opencode: { binary: "opencode", bypassFlags: [], launchSupported: false },
};

export function launchArgs(agentId: AgentId): LaunchArgs {
  return LAUNCH_MAP[agentId];
}

const CLIPBOARD_BINARIES: Array<{ bin: string; args: string[] }> = [
  { bin: "pbcopy", args: [] },
  { bin: "wl-copy", args: [] },
  { bin: "xclip", args: ["-selection", "clipboard"] },
  { bin: "xsel", args: ["--clipboard", "--input"] },
];

export async function copyToClipboard(text: string): Promise<boolean> {
  for (const { bin, args } of CLIPBOARD_BINARIES) {
    const available = await isCommandAvailable(bin);
    if (!available) continue;
    const success = await new Promise<boolean>((resolve) => {
      const proc = spawn(bin, args, { stdio: ["pipe", "ignore", "ignore"] });
      proc.on("error", () => resolve(false));
      proc.on("close", (code) => resolve(code === 0));
      proc.stdin.end(text);
    });
    if (success) return true;
  }
  return false;
}
