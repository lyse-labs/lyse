// packages/core/src/util/git.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export async function gitHeadSha(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    return stdout.trim();
  } catch {
    return "no-git";
  }
}

export interface ModifiedFile {
  path: string;
  contentHash: string;
}

export async function modifiedFilesWithHashes(repoRoot: string): Promise<ModifiedFile[]> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", "HEAD"], { cwd: repoRoot });
    const paths = stdout.split("\n").filter((p) => p.length > 0);
    const out: ModifiedFile[] = [];
    for (const p of paths) {
      try {
        const content = await fs.readFile(join(repoRoot, p), "utf8");
        out.push({
          path: p,
          contentHash: createHash("sha256").update(content).digest("hex").slice(0, 16),
        });
      } catch {
        // file deleted or unreadable — skip
      }
    }
    return out;
  } catch {
    return [];
  }
}
