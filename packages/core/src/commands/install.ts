/**
 * `lyse install` — one-command onboarding (react-doctor-style front door).
 *
 * Wires Lyse into a repo: installs the Lyse skill into every detected coding
 * agent (so the agent knows how to fix drift) and installs the advisory
 * pre-commit hook. Resilient: a missing git repo doesn't abort the skill
 * install — the hook is recorded as skipped instead.
 *
 * Reuses the existing primitives (detectAgents, installLyseSkill, runAddGitHook)
 * rather than duplicating them.
 */

import { detectAgents, type AgentSpec } from "../agent/registry.js";
import { installLyseSkill } from "../agent/skill.js";
import { runAddGitHook, AddGitHookError, type AddGitHookResult } from "./add-git-hook.js";
import { posixRelative } from "../util/paths.js";

export interface InstallOptions {
  cwd: string;
  force?: boolean;
  lyseVersion?: string;
}

export interface InstallDeps {
  /** Override agent detection (tests). Defaults to `detectAgents`. */
  detect?: (root: string) => Promise<AgentSpec[]>;
}

export interface InstallResult {
  skills: { agent: string; path: string; installed: boolean }[];
  hook: AddGitHookResult;
}

export async function runInstall(opts: InstallOptions, deps: InstallDeps = {}): Promise<InstallResult> {
  const detect = deps.detect ?? detectAgents;
  const agents = await detect(opts.cwd);

  const skills = agents.map((a) => {
    const r = installLyseSkill(a, opts.cwd);
    return { agent: a.id, path: posixRelative(opts.cwd, r.path), installed: r.installed };
  });

  let hook: AddGitHookResult;
  try {
    hook = await runAddGitHook({
      cwd: opts.cwd,
      ...(opts.force !== undefined && { force: opts.force }),
      ...(opts.lyseVersion !== undefined && { lyseVersion: opts.lyseVersion }),
    });
  } catch (e) {
    if (e instanceof AddGitHookError) {
      hook = { written: [], skipped: [{ path: ".git/hooks/pre-commit", reason: e.message }] };
    } else {
      throw e;
    }
  }

  return { skills, hook };
}
