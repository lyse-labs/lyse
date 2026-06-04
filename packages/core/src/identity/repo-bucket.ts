import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";

/**
 * Embedded salt — bumped per minor version of lyse.
 * Rotation cadence is documented in spec v4 §14.3.
 */
export const BUCKET_SALT = "lyse-v0-2026Q2";

interface GitInfo {
  firstCommitSha: string;
  normalizedRemoteUrl: string;
}

function safeExecGit(cmd: string, cwd: string): string | null {
  try {
    return execSync(`git ${cmd}`, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Normalize a git remote URL by stripping the scheme, user/auth, and .git suffix,
 * leaving host+path lowercased.
 * Examples:
 *   git@github.com:acme/repo.git           → github.com/acme/repo
 *   https://user:token@github.com/acme/repo → github.com/acme/repo
 *   ssh://git@github.com:22/acme/repo.git   → github.com/acme/repo
 */
export function normalizeRemoteUrl(url: string): string {
  let s = url.trim();
  // Strip scheme://
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  // Strip user:token@
  s = s.replace(/^[^@/]+@/, "");
  // Drop port :NNNN (after host)
  s = s.replace(/:\d+\//, "/");
  // Replace : with / (handles git@host:owner/repo)
  s = s.replace(/:/g, "/");
  // Strip trailing /
  s = s.replace(/\/$/, "");
  // Strip .git suffix
  s = s.replace(/\.git$/, "");
  return s.toLowerCase();
}

function readGitInfo(repoRoot: string): GitInfo | null {
  const gitDir = join(repoRoot, ".git");
  if (!existsSync(gitDir)) return null;
  const firstCommitSha = safeExecGit("rev-list --max-parents=0 HEAD", repoRoot);
  const remoteUrlRaw = safeExecGit("config --get remote.origin.url", repoRoot);
  if (!firstCommitSha || !remoteUrlRaw) return null;
  return {
    firstCommitSha,
    normalizedRemoteUrl: normalizeRemoteUrl(remoteUrlRaw),
  };
}

export interface RepoBucketOptions {
  salt?: string;
}

/**
 * Compute the anonymous repo_bucket fingerprint for the repo at `repoRoot`.
 * Returns null if the repo has no .git, no first commit, or no remote.
 */
export function computeRepoBucket(repoRoot: string, options: RepoBucketOptions = {}): string | null {
  const info = readGitInfo(repoRoot);
  if (!info) return null;
  const salt = options.salt ?? BUCKET_SALT;
  const hash = createHash("sha256")
    .update(info.firstCommitSha)
    .update("|")
    .update(info.normalizedRemoteUrl)
    .update("|")
    .update(salt)
    .digest("hex");
  return hash.slice(0, 16);
}
