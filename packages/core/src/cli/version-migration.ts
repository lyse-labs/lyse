import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";

interface VersionMigrationPaths {
  cacheFile: string;
}

function resolveVersionMigrationPaths(): VersionMigrationPaths {
  const base = process.env["LYSE_CACHE_DIR"] ?? resolve(homedir(), ".cache");
  return { cacheFile: resolve(base, "lyse", "last-version") };
}

export interface MigrationWarningInput {
  currentVersion: string;
  cacheFile?: string;
}

export interface MigrationWarningResult {
  warning: string | null;
  previousVersion: string | null;
}

export function readMigrationWarning(input: MigrationWarningInput): MigrationWarningResult {
  const cacheFile = input.cacheFile ?? resolveVersionMigrationPaths().cacheFile;
  if (!existsSync(cacheFile)) return { warning: null, previousVersion: null };
  let previous: string;
  try {
    previous = readFileSync(cacheFile, "utf8").trim();
  } catch {
    return { warning: null, previousVersion: null };
  }
  if (!previous) return { warning: null, previousVersion: null };
  if (previous === input.currentVersion) return { warning: null, previousVersion: previous };
  if (previous.startsWith("0.1.0-alpha") && input.currentVersion === "0.1.0") {
    return {
      warning: [
        "",
        `⚠  Welcome to Lyse v0.1.0. Scores from ${previous} are not comparable to this release.`,
        "   Why: scoring is now version-pinned as `scoring-v1`, some rules changed during auto-improvement,",
        "   sub-axis promotion to `stable` excludes some previously-counted findings, and confidence",
        "   weighting now applies.",
        "   See: https://github.com/lyse-labs/lyse/blob/main/CHANGELOG.md",
        "",
      ].join("\n"),
      previousVersion: previous,
    };
  }
  return { warning: null, previousVersion: previous };
}

export interface MigrationPersistInput {
  currentVersion: string;
  cacheFile?: string;
}

export function persistCurrentVersion(input: MigrationPersistInput): void {
  const cacheFile = input.cacheFile ?? resolveVersionMigrationPaths().cacheFile;
  try {
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, input.currentVersion, "utf8");
  } catch {
    // Read-only home / no perms — non-fatal.
  }
}
