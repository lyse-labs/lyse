/**
 * `lyse add git-hook` — install a pre-commit hook that surfaces design-system
 * drift in *staged* files before each commit (`lyse audit --staged`).
 *
 * Advisory by design: the hook never blocks a commit (`|| true`) — it surfaces
 * drift so the developer (or their coding agent) can fix it, matching Lyse's
 * "diagnose, don't gate" philosophy. Bypass entirely with `git commit --no-verify`.
 *
 * Mirrors the `add-ci-gate` pattern: inlined template, idempotent, never
 * clobbers a pre-existing hook without `--force`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { gitHooksDir } from "../codemods/git-helpers.js";
import { posixRelative } from "../util/paths.js";
import { VERSION } from "../index.js";

const MARKER = "lyse pre-commit (managed)";

export class AddGitHookError extends Error {
  override name = "AddGitHookError";
}

export interface AddGitHookOptions {
  /** Repo root (must be inside a git repository). */
  cwd: string;
  /** Lyse CLI version the hook should pin (default: the running CLI version). */
  lyseVersion?: string;
  /** Replace a pre-existing (non-managed) pre-commit hook. */
  force?: boolean;
}

export interface AddGitHookResult {
  written: string[];
  skipped: { path: string; reason: string }[];
}

function renderHook(lyseVersion: string): string {
  return `#!/bin/sh
# >>> ${MARKER} >>>
# Surfaces design-system drift in staged files before each commit.
# Advisory only — never blocks the commit. Bypass with: git commit --no-verify
npx --yes "@lyse-labs/lyse@${lyseVersion}" audit --staged --quiet || true
# <<< ${MARKER} <<<
`;
}

export async function runAddGitHook(opts: AddGitHookOptions): Promise<AddGitHookResult> {
  let hooksDir: string;
  try {
    hooksDir = await gitHooksDir(opts.cwd);
  } catch {
    throw new AddGitHookError(
      "Not a git repository — git hooks need a .git directory. Run `git init` first.",
    );
  }

  const lyseVersion = opts.lyseVersion ?? VERSION;
  const hookPath = join(hooksDir, "pre-commit");
  const rel = posixRelative(opts.cwd, hookPath);

  if (existsSync(hookPath)) {
    const current = readFileSync(hookPath, "utf8");
    if (current.includes(MARKER) && !opts.force) {
      return { written: [], skipped: [{ path: rel, reason: "already installed (lyse-managed)" }] };
    }
    if (!current.includes(MARKER) && !opts.force) {
      return {
        written: [],
        skipped: [{ path: rel, reason: "a pre-commit hook already exists (pass --force to replace)" }],
      };
    }
  }

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hookPath, renderHook(lyseVersion), { mode: 0o755 });
  chmodSync(hookPath, 0o755); // ensure +x even if the file pre-existed
  return { written: [rel], skipped: [] };
}
