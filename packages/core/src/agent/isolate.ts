import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Containment for `lyse handoff`: run the agent against a throwaway checkout of
 * HEAD instead of the user's working tree.
 *
 * Off by default, and that is deliberate — `handoff` exists so you can review
 * the agent's work with `git diff` in the repository you are sitting in, and
 * isolating by default would take that away. It is for the unattended case: a
 * nightly loop wants a blast radius it can delete, not a working tree it has to
 * clean up. On timeout the isolated tree is removed, which is the rollback.
 */
export interface IsolateSources {
  /** `--isolate` on the command line. Wins over everything. */
  flag: boolean | undefined;
  env: Record<string, string | undefined>;
  /** `.lyse.yaml` `handoff.isolate`. */
  config: boolean | undefined;
}

export function resolveIsolate(sources: IsolateSources): boolean {
  if (sources.flag !== undefined) return sources.flag;
  if (sources.env["LYSE_HANDOFF_ISOLATE"] === "1") return true;
  return sources.config === true;
}

export interface TreeState {
  isGitRepo: boolean;
  /** Paths reported by `git status --porcelain`, uncommitted. */
  dirtyPaths: readonly string[];
}

const MAX_LISTED = 5;

/**
 * Why isolation cannot be honoured, or null when it can.
 *
 * The dirty-tree refusal is the load-bearing one. An isolated tree is created
 * from HEAD, so with uncommitted work in the real tree the agent would be fixing
 * a version of the repository the user cannot see, and the diff they review
 * afterwards would not be the diff they asked for. Isolating anyway is worse
 * than not isolating: it produces confident-looking work against the wrong
 * input.
 */
export function isolationRefusal(state: TreeState): string | null {
  if (!state.isGitRepo) {
    return "isolation needs a git repository — an isolated tree is a checkout of HEAD, and there is no HEAD here.";
  }
  if (state.dirtyPaths.length === 0) return null;

  const shown = state.dirtyPaths.slice(0, MAX_LISTED);
  const rest = state.dirtyPaths.length - shown.length;
  return [
    `isolation needs a clean tree — ${state.dirtyPaths.length} uncommitted path(s):`,
    ...shown.map((p) => `  ${p}`),
    ...(rest > 0 ? [`  …and ${rest} more`] : []),
    "An isolated tree is checked out from HEAD, so the agent would fix a version of",
    "this repository you cannot see. Commit or stash first, or drop --isolate.",
  ].join("\n");
}

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

export function readTreeState(repoRoot: string): TreeState {
  try {
    git(repoRoot, ["rev-parse", "--git-dir"]);
  } catch {
    return { isGitRepo: false, dirtyPaths: [] };
  }
  let dirtyPaths: string[] = [];
  try {
    dirtyPaths = git(repoRoot, ["status", "--porcelain"])
      .split("\n")
      .map((l) => l.slice(3).trim())
      .filter((l) => l.length > 0);
  } catch {
    dirtyPaths = [];
  }
  return { isGitRepo: true, dirtyPaths };
}

export interface IsolatedTree {
  dir: string;
}

/** A detached worktree at HEAD, or null when git refuses. Never throws. */
export function createIsolatedTree(repoRoot: string): IsolatedTree | null {
  let parent: string;
  try {
    parent = mkdtempSync(join(tmpdir(), "lyse-handoff-"));
  } catch {
    return null;
  }
  const dir = join(parent, "tree");
  try {
    git(repoRoot, ["worktree", "add", "--detach", dir, "HEAD"]);
    return { dir };
  } catch {
    rmSync(parent, { recursive: true, force: true });
    return null;
  }
}

/**
 * Remove the isolated tree and its registration. Safe to call twice and never
 * throws: this is the rollback path, and a rollback that can fail is not one.
 */
export function removeIsolatedTree(repoRoot: string, dir: string): void {
  try {
    git(repoRoot, ["worktree", "remove", "--force", dir]);
  } catch {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
  try {
    git(repoRoot, ["worktree", "prune"]);
  } catch {
    /* best effort */
  }
}
