// packages/core/src/mcp/_find-root.ts
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

/**
 * Walks up to 12 parent directories from `startPath` to find a Lyse project
 * root: the closest ancestor containing `.lyse.yaml` or `.git`.
 * Falls back to the immediate parent if no marker found.
 *
 * Accepts either a file path (uses its parent directory as the starting
 * point) or a directory path (starts from that directory directly).
 *
 * Shared between MCP tools (audit-file, check-intent, suggest-fix) to avoid
 * duplication. v0.1.1 ADR 0014 MCP tools will use the same helper.
 */
export function findProjectRoot(startPath: string): string {
  let dir = dirname(resolve(startPath));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, ".lyse.yaml")) || existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(resolve(startPath));
}
