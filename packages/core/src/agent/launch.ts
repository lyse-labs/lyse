import { copyToClipboard as copyToClipboardOrThrow } from "../share/clipboard.js";
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

/**
 * Copy `text` to the system clipboard, returning whether it succeeded.
 * Delegates to the canonical {@link copyToClipboardOrThrow} (which throws on
 * failure) and never throws itself — callers branch on the boolean.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await copyToClipboardOrThrow(text);
    return true;
  } catch {
    return false;
  }
}
