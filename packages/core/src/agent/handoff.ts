import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Finding, TokenMap } from "../types.js";
import type { AgentId } from "./registry.js";
import { launchArgs, copyToClipboard } from "./launch.js";
import { isCommandAvailable, detectAgents } from "./registry.js";
import { buildHandoffPayload, serializeTokenMap } from "./payload.js";
import { installLyseSkill } from "./skill.js";

export interface HandoffDeps {
  prompt: (choices: { value: string; label: string }[]) => Promise<string | null>;
  launch: (agentId: AgentId, prompt: string, cwd: string) => Promise<number>;
  /** Injected path for the handoff-target persistence file (tests only). */
  targetFilePath?: string;
}

export interface HandoffInput {
  findings: Finding[];
  tokens: TokenMap | null;
  root: string;
  projectName: string;
  topN?: number;
}

export type HandoffAction = "launched" | "copied" | "skipped" | "none";

export interface HandoffResult {
  action: HandoffAction;
  agentId?: AgentId;
}

const HANDOFF_DIR_NAME = join(".lyse", "handoff");
const DEFAULT_TOP_N = 10;
const DEFAULT_MAX_FILES_PER_RULE = 5;

function writeArtifacts(handoffDir: string, findings: Finding[], tokens: TokenMap | null): void {
  mkdirSync(handoffDir, { recursive: true });
  writeFileSync(join(handoffDir, "findings.json"), JSON.stringify(findings, null, 2) + "\n");
  writeFileSync(join(handoffDir, "tokens.json"), JSON.stringify(serializeTokenMap(tokens), null, 2) + "\n");
}

function persistTarget(targetFilePath: string, agentId: AgentId): void {
  try {
    mkdirSync(join(targetFilePath, ".."), { recursive: true });
    writeFileSync(targetFilePath, JSON.stringify({ agentId }, null, 2) + "\n");
  } catch {
    // Tolerate write failure (e.g. read-only FS, missing HOME).
  }
}

export async function runHandoff(input: HandoffInput, deps: HandoffDeps): Promise<HandoffResult> {
  const { findings, tokens, root, projectName } = input;
  const topN = input.topN ?? DEFAULT_TOP_N;

  if (findings.length === 0) {
    return { action: "none" };
  }

  const handoffDir = join(root, HANDOFF_DIR_NAME);
  writeArtifacts(handoffDir, findings, tokens);

  const payload = buildHandoffPayload(findings, {
    projectName,
    topN,
    maxFilesPerRule: DEFAULT_MAX_FILES_PER_RULE,
  });

  const availableAgents = await detectAgents(root);
  const launchableAgents = await Promise.all(
    availableAgents.map(async (spec) => {
      const args = launchArgs(spec.id);
      if (!args.launchSupported) return null;
      const launchBinAvailable = await isCommandAvailable(args.binary);
      if (!launchBinAvailable) return null;
      return spec;
    }),
  );

  const choices: { value: string; label: string }[] = launchableAgents
    .filter((s) => s !== null)
    .map((spec) => ({ value: spec.id, label: `Hand off to ${spec.displayName}` }));

  choices.push({ value: "copy", label: "Copy prompt to clipboard" });
  choices.push({ value: "skip", label: "Skip" });

  const chosen = await deps.prompt(choices);

  if (chosen === null || chosen === "skip") {
    return { action: "skipped" };
  }

  if (chosen === "copy") {
    await copyToClipboard(payload);
    return { action: "copied" };
  }

  const agentId = chosen as AgentId;
  const agentSpec = launchableAgents.filter((s) => s !== null).find((s) => s.id === agentId);
  if (agentSpec !== undefined) {
    installLyseSkill(agentSpec, root);
  }

  const targetFilePath =
    deps.targetFilePath ?? join(homedir(), ".lyse", "handoff-target.json");
  persistTarget(targetFilePath, agentId);

  await deps.launch(agentId, payload, root);

  return { action: "launched", agentId };
}

export async function spawnAgentLauncher(agentId: AgentId, prompt: string, cwd: string): Promise<number> {
  const args = launchArgs(agentId);
  if (!args.launchSupported) return 1;
  const { binary, bypassFlags } = args;
  return new Promise((resolve) => {
    const proc = spawn(binary, [...bypassFlags, prompt], { stdio: "inherit", cwd });
    proc.on("error", () => resolve(1));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}
