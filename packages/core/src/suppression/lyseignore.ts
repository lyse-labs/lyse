import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadLyseIgnore(repoRoot: string): string[] {
  const path = resolve(repoRoot, ".lyseignore");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}
