import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";

const IGNORE = ".lyse/*";
const NEGATE = "!.lyse/baseline.json";
const HEADER = "# Lyse local cache (baseline.json is tracked)";

/**
 * Ensures .gitignore ignores .lyse/ contents while keeping baseline.json
 * trackable. Git cannot re-include a file under an excluded *directory*, so we
 * use the contents-form `.lyse/*` and migrate any legacy `.lyse/` line.
 * No-op outside a git repo.
 */
export async function ensureLyseGitignore(repoRoot: string): Promise<void> {
  try {
    await access(join(repoRoot, ".git"), constants.F_OK);
  } catch {
    return;
  }

  const gPath = join(repoRoot, ".gitignore");
  const before = await readFileSafe(gPath);
  let lines: string[] = before === null ? [] : before.split("\n");

  // Drop any legacy directory-form ignore that would defeat the negation.
  lines = lines.filter((l) => {
    const t = l.trim();
    return t !== ".lyse/" && t !== ".lyse";
  });

  const has = (entry: string) => lines.some((l) => l.trim() === entry);
  const additions: string[] = [];
  if (!has(IGNORE)) additions.push(IGNORE);
  if (!has(NEGATE)) additions.push(NEGATE);

  const body = [...lines];
  if (additions.length > 0) {
    if (body.length > 0 && body[body.length - 1]!.trim() !== "") body.push("");
    body.push(HEADER, ...additions);
  }
  const out = body.join("\n").replace(/\n*$/, "\n");

  if (out === before) return; // nothing changed — byte-identical, skip write
  await writeFile(gPath, out);
}

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}
