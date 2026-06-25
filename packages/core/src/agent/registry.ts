import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export type AgentId = "claude-code" | "cursor" | "codex" | "opencode";

export interface AgentSpec {
  id: AgentId;
  displayName: string;
  /** Launch binary (used for PATH detection now; for spawn in v2). */
  binary: string;
  /** Dirs (absolute, or repo-relative) whose presence signals the agent is set up here. */
  configDirs: string[];
  /** Where the Lyse skill is written, relative to the repo root. */
  skillRelPath: string;
  skillFormat: "skill-md" | "cursor-mdc" | "agents-md";
}

export const AGENTS: AgentSpec[] = [
  { id: "claude-code", displayName: "Claude Code", binary: "claude", configDirs: [join(homedir(), ".claude"), ".claude"], skillRelPath: ".claude/skills/lyse/SKILL.md", skillFormat: "skill-md" },
  { id: "cursor", displayName: "Cursor", binary: "cursor", configDirs: [".cursor"], skillRelPath: ".cursor/rules/lyse.mdc", skillFormat: "cursor-mdc" },
  { id: "codex", displayName: "Codex", binary: "codex", configDirs: [join(homedir(), ".codex")], skillRelPath: "AGENTS.md", skillFormat: "agents-md" },
  { id: "opencode", displayName: "OpenCode", binary: "opencode", configDirs: [join(homedir(), ".config", "opencode"), ".opencode"], skillRelPath: ".opencode/skills/lyse/SKILL.md", skillFormat: "skill-md" },
];

export function isCommandAvailable(bin: string): Promise<boolean> {
  // The POSIX branch interpolates `bin` into a shell command — only accept a
  // plain binary token so this can never become a shell-injection vector,
  // regardless of caller (the function is exported).
  if (!/^[A-Za-z0-9_.-]+$/.test(bin)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const probe = process.platform === "win32"
      ? spawn("where", [bin], { stdio: "ignore" })
      : spawn("/bin/sh", ["-c", `command -v ${bin}`], { stdio: "ignore" });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
}

export async function detectAgents(root: string): Promise<AgentSpec[]> {
  const detected: AgentSpec[] = [];
  for (const agent of AGENTS) {
    const dirHit = agent.configDirs.some((d) => existsSync(isAbsolute(d) ? d : join(root, d)));
    if (dirHit || (await isCommandAvailable(agent.binary))) detected.push(agent);
  }
  return detected;
}
