import fg from "fast-glob";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Exported so nothing has to keep a second copy. A hand-maintained duplicate of
 * this list drifts — the reason `docs/measurement/labeling-protocol.md` exists
 * is a copy-pasted candidate list that let a labeler inherit its rule's blind
 * spot.
 */
export const SOURCE_GLOBS = [
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
  // Nested variants — the same shapes recur as a package inside a monorepo,
  // e.g. packages/paste-website/**, which the root-anchored globs above
  // don't reach. Suffix-shaped patterns (*-website, *-docs) catch compound
  // package names without matching unrelated ones like packages/website-ui/**.
  "**/docs/**",
  "**/docs-site/**",
  "**/website/**",
  "**/site/**",
  "**/*-website/**",
  "**/*-docs/**",

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
  "**/__fixtures__/**",
  "**/test-utils/**",
  "**/__tests__/**",
  "**/__mocks__/**",

  // Build/dev tooling
  "scripts/**",
  "script/**",
  "packages-internal/**",
  "packages/dev/**",
  "packages/@*/dev*/**",
  "**/build-tools/**",

  // Storybook: config, plus code files inside any `stories/` subfolder.
  // `*.stories.tsx` files co-located next to real components are scanned
  // separately via `loadStories()`, not via this walker — but demo/example
  // components that live INSIDE a `stories/` directory (e.g.
  // `<pkg>/stories/components/*.tsx`, used only to compose a story) are
  // never design-system source. Scoped to code extensions only (not a
  // blanket `**/stories/**`): stylesheets under `stories/` are a real token
  // source on some repos (e.g. radix-ui/primitives keeps its CSS custom
  // properties in `apps/storybook/stories/*.stories.module.css`), so `.css`
  // and `.scss` must stay visible to the walker.
  "**/.storybook/**",
  "**/stories/**/*.ts",
  "**/stories/**/*.tsx",
  "**/stories/**/*.js",
  "**/stories/**/*.jsx",
  "**/stories/**/*.mjs",
  "**/stories/**/*.cjs",
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
  // fast-glob's directory traversal reads sibling directories concurrently
  // for performance; the SET of matches is correct but their ORDER depends
  // on filesystem I/O completion timing, which is not stable across runs
  // (confirmed on a real repo: same process, repeated calls returned the
  // same files in different orders). Every downstream consumer of this list
  // — component-inventory construction, canonical-source tie-breaking
  // (`resolveComponentSources`'s documented walk-order fallback), rules
  // that iterate the inventory directly — treats "first in this array" as
  // meaningful, so an unstable walk leaks into unstable finding order.
  // Sorting here fixes it at the one shared source instead of re-sorting
  // separately at each downstream call site.
  matches.sort();
  return matches;
}
