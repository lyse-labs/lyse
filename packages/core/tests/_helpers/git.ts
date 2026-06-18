import { execFileSync } from "node:child_process";

/**
 * Cross-platform git helpers for tests (#104).
 *
 * `execSync("git init && git config … && git commit …")` relies on a POSIX
 * shell (`&&` chaining, and some call sites hardcode `shell: "/bin/sh"`), which
 * does not exist on the Windows CI runner (`spawnSync /bin/sh ENOENT`). These
 * helpers run each git command via `execFileSync` with an args array — no
 * shell, identical on every platform.
 */

/** Run a git command (args array) in `cwd`, returning trimmed stdout. */
export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** `git init` + a deterministic test identity. */
export function gitInit(cwd: string, opts: { email?: string; name?: string } = {}): void {
  execFileSync("git", ["init", "-q"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", opts.email ?? "t@t.com"], { cwd, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", opts.name ?? "t"], { cwd, stdio: "ignore" });
}

/** Stage everything and commit. */
export function gitCommitAll(cwd: string, message = "init", opts: { allowEmpty?: boolean } = {}): void {
  execFileSync("git", ["add", "."], { cwd, stdio: "ignore" });
  execFileSync("git", ["commit", ...(opts.allowEmpty ? ["--allow-empty"] : []), "-m", message], {
    cwd,
    stdio: "ignore",
  });
}

/** `git init` + initial empty (or staged) commit + identity — the common test fixture. */
export function gitInitWithCommit(cwd: string, opts: { allowEmpty?: boolean; message?: string } = {}): void {
  gitInit(cwd);
  gitCommitAll(cwd, opts.message ?? "init", { allowEmpty: opts.allowEmpty ?? true });
}
