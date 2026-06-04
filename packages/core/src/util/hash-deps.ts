import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Hash selected dependencies from package.json.
 * If `tracked` is provided, only those keys are hashed.
 * If not provided, hashes the union of dependencies + devDependencies.
 */
export function hashDeps(repoRoot: string, tracked?: string[]): string {
  const pkgPath = join(repoRoot, "package.json");
  if (!existsSync(pkgPath)) return "";
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies };
  if (tracked) {
    const selected: Record<string, string> = {};
    for (const dep of tracked) if (dep in all) selected[dep] = all[dep]!;
    return "sha256:" + createHash("sha256").update(JSON.stringify(selected)).digest("hex").slice(0, 16);
  }
  return "sha256:" + createHash("sha256").update(JSON.stringify(all)).digest("hex").slice(0, 16);
}
