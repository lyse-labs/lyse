import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { minimatch } from "minimatch";

export function loadLyseIgnore(repoRoot: string): string[] {
  const path = resolve(repoRoot, ".lyseignore");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export function isExcluded(
  relPath: string,
  defaults: readonly string[],
  custom: readonly string[],
): boolean {
  for (const pat of defaults) if (minimatch(relPath, pat)) return true;
  for (const pat of custom) if (minimatch(relPath, pat)) return true;
  return false;
}
