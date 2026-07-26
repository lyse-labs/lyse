import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout.trimEnd();
}

export async function gitShowFile(cwd: string, ref: string, path: string): Promise<string> {
  try {
    return await git(["show", `${ref}:${path}`], cwd);
  } catch {
    return "";
  }
}
