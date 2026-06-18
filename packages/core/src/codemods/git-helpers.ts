import { promisify } from "node:util";
import { exec as execCb, execFile as execFileCb } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

// Invoke git via execFile with an ARGS ARRAY — no shell, so no quoting/escaping
// and no `/bin/sh`-vs-`cmd.exe` divergence. Cross-platform (#104): the old
// `exec("git " + cmd)` form broke on Windows (POSIX single-quote escaping in
// the commit message is meaningless to cmd.exe).
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFile("git", args, { cwd });
  return stdout.trim();
}

async function gitOrNull(args: string[], cwd: string): Promise<string | null> {
  try {
    return await git(args, cwd);
  } catch {
    return null;
  }
}

export async function ensureClean(cwd: string, allowDirty: boolean): Promise<void> {
  const status = await git(["status", "--porcelain"], cwd);
  if (status === "" || allowDirty) return;
  throw new Error(
    "Cannot auto-fix: uncommitted changes detected.\n" +
    "  Commit or stash first, then re-run.\n" +
    "  (Override: lyse fix --force-on-dirty)"
  );
}

export async function ensureSafeBranch(cwd: string): Promise<void> {
  const branch = await gitOrNull(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (!branch || branch === "HEAD") {
    throw new Error("Cannot auto-fix: detached HEAD. Check out a branch first.");
  }
}

export async function createBranch(cwd: string, baseName: string): Promise<string> {
  let name = baseName;
  let suffix = 1;
  while (await branchExists(cwd, name)) {
    suffix++;
    name = `${baseName}-${suffix}`;
  }
  await git(["checkout", "-b", name], cwd);
  return name;
}

async function branchExists(cwd: string, name: string): Promise<boolean> {
  const result = await gitOrNull(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], cwd);
  return result !== null;
}

export async function commitAll(cwd: string, message: string): Promise<string> {
  await git(["add", "-A"], cwd);
  await git(["commit", "-m", message], cwd);
  return git(["rev-parse", "HEAD"], cwd);
}

export async function revertCommit(cwd: string, sha: string): Promise<void> {
  await git(["reset", "--hard", `${sha}^`], cwd);
}

export async function runTests(cwd: string): Promise<{ passed: boolean; output: string }> {
  try {
    const { stdout, stderr } = await exec("npm test --silent", { cwd });
    return { passed: true, output: stdout + stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { passed: false, output: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

export async function hasTestScript(cwd: string): Promise<boolean> {
  try {
    const raw = await readFile(join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return !!pkg.scripts?.test;
  } catch {
    return false;
  }
}
