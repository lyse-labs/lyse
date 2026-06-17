import fg from "fast-glob";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOURCE_GLOBS = [
  "**/*.ts",
  "**/*.tsx",
  "**/*.js",
  "**/*.jsx",
  "**/*.mjs",
  "**/*.cjs",
  "**/*.css",
  "**/*.scss",
  "**/*.svelte",
  "**/*.vue",
];

/**
 * Hardcoded ignores for generated/tooling directories that are never DS source.
 * Separate from DEFAULT_EXCLUDE_PATHS so both lists can be combined at runtime.
 */
const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/.git/**",
];

/**
 * Conventional non-DS directories present in mature design-system monorepos.
 * Including examples, docs sites, sandboxes, test infrastructure, and dev tooling
 * prevents noise from non-DS-public-surface code from drowning out real findings.
 *
 * These extend DEFAULT_IGNORES (both are applied). Users can add more via
 * config.designSystem.excludePaths — user paths EXTEND these defaults.
 */
export const DEFAULT_EXCLUDE_PATHS = [
  // Documentation and demo sites — never DS public API
  "apps/docs/**",
  "apps/www/**",
  "apps/*.dev/**",
  "apps/*.com/**",
  "docs/**",
  "docs-site/**",
  "website/**",
  "site/**",

  // Example apps, starter templates, sandboxes
  "examples/**",
  "starters/**",
  "starter/**",
  "templates/**",
  "sandbox/**",
  "playground/**",

  // Test infrastructure
  "test/**",
  "tests/**",
  "e2e/**",
  "**/fixtures/**",
  "**/test-utils/**",
  "**/__tests__/**",

  // Build/dev tooling
  "scripts/**",
  "script/**",
  "packages-internal/**",
  "packages/dev/**",
  "packages/@*/dev*/**",
  "**/build-tools/**",

  // Storybook config (stories are scanned elsewhere)
  "**/.storybook/**",
];

function readGitignore(root: string): string[] {
  const path = join(root, ".gitignore");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n");
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

export interface WalkOptions {
  /** Additional glob patterns to ignore on top of DEFAULT_IGNORES + DEFAULT_EXCLUDE_PATHS. */
  extraIgnores?: string[];
}

export async function walk(root: string, opts: WalkOptions | string[] = {}): Promise<string[]> {
  // Backward-compat: legacy callers passed extraIgnores as a plain string[].
  const extraIgnores = Array.isArray(opts) ? opts : (opts.extraIgnores ?? []);
  const ignores = [...DEFAULT_IGNORES, ...DEFAULT_EXCLUDE_PATHS, ...readGitignore(root), ...extraIgnores];
  const matches = await fg(SOURCE_GLOBS, {
    cwd: root,
    absolute: true,
    ignore: ignores,
    dot: false,
    followSymbolicLinks: false,
  });
  return matches;
}
