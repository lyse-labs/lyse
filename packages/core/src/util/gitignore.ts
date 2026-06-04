import { readFile, appendFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

/**
 * Ensures that an entry exists in .gitignore at the given repository root.
 * Idempotent: if the entry already exists, this is a no-op.
 * If not in a git repo (no .git/ directory), this is also a no-op.
 *
 * @param cwd Repository root directory
 * @param entry The .gitignore entry to ensure (e.g., ".lyse/")
 */
export async function ensureGitignoreEntry(cwd: string, entry: string): Promise<void> {
  // No-op if not a git repo
  try {
    await access(join(cwd, ".git"), constants.F_OK);
  } catch {
    return;
  }

  const gPath = join(cwd, ".gitignore");
  try {
    const raw = await readFile(gPath, "utf8");
    // Check if entry exists (exact match or with/without trailing slash)
    const normalizedEntry = entry.replace(/\/$/, "");
    const lines = raw.split("\n");
    if (lines.some((line) => {
      const normalized = line.trim().replace(/\/$/, "");
      return normalized === normalizedEntry || normalized === entry.trim();
    })) {
      return; // Already exists
    }
    await appendFile(gPath, `\n# Lyse local cache\n${entry}\n`);
  } catch {
    // File doesn't exist, create it
    await writeFile(gPath, `# Lyse local cache\n${entry}\n`);
  }
}
