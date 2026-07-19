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
import { getRegisteredRuleMeta } from "../rules/_rule-module.js";
import { confirmBypass } from "../menu/prompts.js";

/** Passed through to `deps.launch` so it can build the right argv (`--review` omits the permission-bypass flag). */
export interface LaunchOpts {
  reviewMode?: boolean;
}

export interface HandoffDeps {
  prompt: (choices: { value: string; label: string }[]) => Promise<string | null>;
  launch: (agentId: AgentId, prompt: string, cwd: string, opts?: LaunchOpts) => Promise<number>;
  /** Injected path for the handoff-target persistence file (tests only). */
  targetFilePath?: string;
  /**
   * Pre-spawn safety confirmation, shown only in the default (unattended,
   * permission-bypassed) mode — skipped entirely when `reviewMode` is set.
   * Defaults to {@link confirmBypass} (real TTY prompt; auto-proceeds when
   * non-interactive/CI/`--yes`).
   */
  confirm?: (message: string) => Promise<boolean>;
}

export interface HandoffInput {
  findings: Finding[];
  tokens: TokenMap | null;
  root: string;
  projectName: string;
  topN?: number;
  /** `.lyse.yaml` `advisory.migrationScaleFileCount` override; falls back to the payload default. */
  migrationScaleFileCount?: number;
  /**
   * `--review` / `LYSE_HANDOFF_REVIEW=1` / `.lyse.yaml` `handoff.review`:
   * launch the agent under its own default permission model (it prompts
   * per-action) instead of bypassing permission prompts. Also skips the
   * pre-spawn safety confirmation — the agent's own prompts are the safety
   * net in this mode. Default `false`.
   */
  reviewMode?: boolean;
}

type HandoffAction = "launched" | "copied" | "copy-failed" | "skipped" | "none";

export interface HandoffResult {
  action: HandoffAction;
  agentId?: AgentId;
}

const HANDOFF_DIR_NAME = join(".lyse", "handoff");
const DEFAULT_TOP_N = 10;
const DEFAULT_MAX_FILES_PER_RULE = 5;

/**
 * Enriches each finding with its rule's `helpUri` (recipe link) when the
 * rule is registered — looked up once per unique `ruleId`. Uses
 * `exactOptionalPropertyTypes`-safe conditional spread so unregistered
 * rules omit the key entirely rather than serializing `helpUri: undefined`.
 */
function enrichWithHelpUri(findings: Finding[]): (Finding & { helpUri?: string })[] {
  const helpUriByRule = new Map<string, string | undefined>();
  return findings.map((f) => {
    if (!helpUriByRule.has(f.ruleId)) {
      helpUriByRule.set(f.ruleId, getRegisteredRuleMeta(f.ruleId)?.helpUri);
    }
    const helpUri = helpUriByRule.get(f.ruleId);
    return { ...f, ...(helpUri ? { helpUri } : {}) };
  });
}

function writeArtifacts(handoffDir: string, findings: Finding[], tokens: TokenMap | null): void {
  mkdirSync(handoffDir, { recursive: true });
  writeFileSync(join(handoffDir, "findings.json"), JSON.stringify(enrichWithHelpUri(findings), null, 2) + "\n");
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
    ...(input.migrationScaleFileCount !== undefined
      ? { migrationScaleFileCount: input.migrationScaleFileCount }
      : {}),
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

  const launchable = launchableAgents.filter((s) => s !== null);
  const choices: { value: string; label: string }[] = launchable
    .map((spec) => ({ value: spec.id, label: `Hand off to ${spec.displayName}` }));

  choices.push({ value: "copy", label: "Copy prompt to clipboard" });
  choices.push({ value: "skip", label: "Skip" });

  const chosen = await deps.prompt(choices);

  if (chosen === null || chosen === "skip") {
    return { action: "skipped" };
  }

  if (chosen === "copy") {
    const copied = await copyToClipboard(payload);
    return { action: copied ? "copied" : "copy-failed" };
  }

  const agentId = chosen as AgentId;
  const agentSpec = launchable.find((s) => s.id === agentId);
  if (agentSpec !== undefined) {
    installLyseSkill(agentSpec, root);
  }

  const reviewMode = input.reviewMode ?? false;

  if (!reviewMode) {
    const confirmFn = deps.confirm ?? confirmBypass;
    const agentLabel = agentSpec?.displayName ?? agentId;
    const proceed = await confirmFn(
      `Lyse will run ${agentLabel} with permission prompts bypassed to edit your working tree. ` +
        `Nothing is committed or pushed; you review the git diff afterward. Continue?`,
    );
    if (!proceed) {
      return { action: "skipped" };
    }
  }

  const targetFilePath =
    deps.targetFilePath ?? join(homedir(), ".lyse", "handoff-target.json");
  persistTarget(targetFilePath, agentId);

  await deps.launch(agentId, payload, root, { reviewMode });

  return { action: "launched", agentId };
}

export async function spawnAgentLauncher(
  agentId: AgentId,
  prompt: string,
  cwd: string,
  opts?: LaunchOpts,
): Promise<number> {
  const args = launchArgs(agentId, opts?.reviewMode ?? false);
  if (!args.launchSupported) return 1;
  const { binary, bypassFlags } = args;
  return new Promise((resolve) => {
    const proc = spawn(binary, [...bypassFlags, prompt], { stdio: "inherit", cwd });
    proc.on("error", () => resolve(1));
    proc.on("close", (code) => resolve(code ?? 1));
  });
}
