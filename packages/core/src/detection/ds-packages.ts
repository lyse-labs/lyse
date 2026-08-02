import fg from "fast-glob";
import { fileBelongsToOwner } from "./nested-packages.js";
import type { DsFamily, DsFamilyMember, DsPackageEvidence, WorkspacePackage } from "./types.js";

/**
 * Verified on disk, not assumed: the typical radix primitive package
 * (`packages/react/tabs/src/` = `index.ts` + `tabs.tsx`) holds exactly ONE
 * component-shaped file — `index.ts` doesn't count, `.ts` is deliberately
 * excluded (see `COMPONENT_FILE_GLOB` below). A floor of 2 excluded ~93% of
 * radix's ~58 real primitive packages, keeping only the handful that happen
 * to split a hook into a second file (`presence`, `collection`, …).
 * Precision does not come from this threshold — it comes from `disqualify()`
 * ruling out apps, docs, tests and tooling, and from `COMPONENT_FILE_GLOB`/
 * `COUNT_IGNORE` only counting real component-shaped source. One real
 * component file is sufficient evidence; zero is not.
 */
export const MIN_COMPONENT_FILES = 1;

/**
 * Verified against the 26-repo bench corpus (isolated per-segment measurement,
 * every removal confirmed on disk — see `.superpowers/sdd/task-3-report.md`):
 * `apps`'s plural-only form let three real, singular, bare top-level
 * directories through — ariakit's own private demo app (`app`), its docs
 * guide (`guide`, per-section `site-icon.tsx` files, not components) and its
 * Next.js integration example (`nextjs`, a real `next dev`/`next build` app);
 * `demo` catches mantine's `@mantinex/demo` ("Demo base components used on
 * *.mantine.dev websites" per its own package.json). Candidates that removed
 * nothing across all 26 repos (`demos`, `example`, `template`, `www`,
 * `storybook`) were dropped as untested surface, not added speculatively.
 */
const APP_OR_SITE_DIR_SEGMENTS = new Set([
  "apps", "app", "docs", "site", "sites", "website", "playground", "playgrounds",
  "examples", "templates", "e2e", "demo", "guide", "nextjs",
]);

const DOCS_OR_SITE_NAME_RE = /(-website|-docs|-site)$|\.(com|dev|io)$|^@docs\//;
const TEST_OR_TOOLING_NAME_RE = /^@[^/]*-tests?\//;
const TEST_OR_TOOLING_SUFFIXES = [
  "-internal", "-test-utils", "-tests", "-test", "-tooling", "-build", "-scripts", "-codemods",
];

/**
 * `web`/`test`/`tests`/`docs` disqualify a package only in the two shapes
 * they were actually derived from — a bare full-string name match, tried and
 * reverted, was over-broad: a cross-platform design system split as
 * `packages/native` + `packages/web`, where `@acme/web` is the real 50-file
 * web component library, must survive; today it would be discarded by name
 * alone.
 *
 * Shape 1 — bare top-level directory (`isBareTopLevelDir`): the package's
 * ENTIRE `relDir` is one of these words as a single path segment. Verified
 * against the 26-repo bench corpus: corvu's docs site really is at
 * `relDir: "web"`, independent of what it happens to be named. `docs` is
 * listed here for symmetry with `APP_OR_SITE_DIR_SEGMENTS`, which already
 * disqualifies a `docs` segment at any depth via `app-or-site-directory`
 * earlier in `disqualify` — so this branch is unreachable for `docs` today,
 * not a live rule; kept in case that set ever narrows.
 *
 * Shape 2 — scoped local name (`isScopedTestOrDocsName`): the package name
 * (after the last `/`) is exactly `test`, `tests` or `docs` — no real design
 * system publishes itself as `@scope/test` (verified: this is what catches
 * ariakit's `@ariakit/test`, one real `.tsx` file that is a test helper, not
 * a component). Requires an actual scope — an unscoped name carries none of
 * that signal. `web` is deliberately excluded from this shape: unlike
 * `test`/`tests`/`docs`, `@scope/web` is a plausible name for a real,
 * evidenced component package (the cross-platform case above).
 *
 * Candidates that removed nothing across all 26 repos (`www`, `site`,
 * `demos`, `playground`, `storybook`) and candidates that only ever removed
 * the same package the directory-segment check already removes (`app`,
 * `demo`) were dropped — the former as untested surface, the latter as
 * redundant, unconfirmed-independently.
 */
const BARE_TOP_LEVEL_DIR_WORDS = new Set(["web", "test", "tests", "docs"]);
const SCOPED_TEST_OR_DOCS_WORDS = new Set(["test", "tests", "docs"]);

function localName(name: string): string {
  const lastSlash = name.lastIndexOf("/");
  return lastSlash === -1 ? name : name.slice(lastSlash + 1);
}

function isBareTopLevelDir(relDir: string): boolean {
  return BARE_TOP_LEVEL_DIR_WORDS.has(relDir.toLowerCase());
}

function isScopedTestOrDocsName(name: string): boolean {
  if (!name.includes("/")) return false;
  return SCOPED_TEST_OR_DOCS_WORDS.has(localName(name).toLowerCase());
}

/**
 * The first disqualifying rule that applies, or null. Order is part of the
 * contract: `evidence[name].disqualifiedBy` names exactly one reason, and tests
 * pin which one, so reordering these branches is a behaviour change.
 */
function disqualify(pkg: WorkspacePackage): string | null {
  if (pkg.relDir === "") return "workspace-root";
  const segments = pkg.relDir.split("/");
  if (segments.some(s => APP_OR_SITE_DIR_SEGMENTS.has(s.toLowerCase()))) return "app-or-site-directory";
  if (isBareTopLevelDir(pkg.relDir) || isScopedTestOrDocsName(pkg.name) || DOCS_OR_SITE_NAME_RE.test(pkg.name)) {
    return "docs-or-site-name";
  }
  if (TEST_OR_TOOLING_NAME_RE.test(pkg.name)) return "test-or-tooling-name";
  if (TEST_OR_TOOLING_SUFFIXES.some(suffix => pkg.name.endsWith(suffix))) return "test-or-tooling-name";
  return null;
}

/**
 * Classify a repo's workspace packages into the design-system family.
 *
 * Evidence, never names: a survivor qualifies on component-shaped file count,
 * or on declaring a public entry while not being private. `private: true` is
 * NOT on its own disqualifying — cal.com's real design system (`@calcom/ui`) is
 * private, while its docs-demo and test packages are public.
 *
 * Pure and order-independent: the caller's array order cannot change the result.
 */
export function identifyDsFamily(
  packages: WorkspacePackage[],
  componentFileCounts: Map<string, number>,
): DsFamily {
  const evidenceEntries: [string, DsPackageEvidence][] = [];
  const survivors: WorkspacePackage[] = [];

  for (const pkg of packages) {
    const componentFiles = componentFileCounts.get(pkg.name) ?? 0;
    const disqualifiedBy = disqualify(pkg);
    evidenceEntries.push([pkg.name, {
      componentFiles,
      hasPublicEntry: pkg.hasPublicEntry,
      private: pkg.private,
      disqualifiedBy,
    }]);
    if (disqualifiedBy !== null) continue;
    // Component files are the ONLY qualifying evidence. A declared public entry
    // is not enough on its own — a published utility package would otherwise
    // join the family. It contributes to `primary` selection instead.
    if (componentFiles >= MIN_COMPONENT_FILES) survivors.push(pkg);
  }

  // Sorted alphabetically — CLAUDE.md's determinism rule, and this record is
  // one JSON.stringify away from a report. Build order must not leak here.
  evidenceEntries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const evidence: Record<string, DsPackageEvidence> = Object.fromEntries(evidenceEntries);

  if (survivors.length === 0) {
    return { isDesignSystem: false, members: [], primary: null, evidence };
  }

  const members: DsFamilyMember[] = survivors
    .map(p => ({ name: p.name, relDir: p.relDir }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { isDesignSystem: true, members, primary: choosePrimary(survivors, componentFileCounts), evidence };
}

/**
 * A total order so the label is stable, not an attempt to name "the" design
 * system: public entry first, then most component-file evidence, then
 * shallowest directory, then name. The label now prefers the package with
 * the strongest evidence, not merely the one that happens to sort first —
 * a single-file package (e.g. a commercial add-on) must not outrank the
 * package holding the actual components just because its name is
 * alphabetically earlier or its directory no deeper.
 */
function choosePrimary(candidates: WorkspacePackage[], componentFileCounts: Map<string, number>): string {
  const [best] = [...candidates].sort((a, b) => {
    if (a.hasPublicEntry !== b.hasPublicEntry) return a.hasPublicEntry ? -1 : 1;
    const filesA = componentFileCounts.get(a.name) ?? 0;
    const filesB = componentFileCounts.get(b.name) ?? 0;
    if (filesA !== filesB) return filesB - filesA;
    const depthA = a.relDir.split("/").length;
    const depthB = b.relDir.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return best?.name ?? "";
}

/**
 * `.tsx`/`.jsx`/`.vue`/`.svelte` only: these extensions are themselves evidence
 * of a component. `.ts`/`.js` are excluded deliberately — a package full of
 * utilities would otherwise look like a design system.
 */
const COMPONENT_FILE_GLOB = "**/*.{tsx,jsx,vue,svelte}";
const COUNT_IGNORE = [
  "**/node_modules/**", "**/dist/**", "**/build/**",
  "**/*.test.*", "**/*.spec.*", "**/*.stories.*", "**/*.story.*", "**/*.d.ts",
  "**/__tests__/**", "**/__mocks__/**", "**/__fixtures__/**",
  "**/test/**", "**/tests/**", "**/fixtures/**", "**/e2e/**",
];

/**
 * One glob over the whole repo, then longest-prefix attribution — not one glob
 * per package. A 123-package monorepo (Twilio Paste) would otherwise pay 123
 * filesystem walks just to decide what its design system is.
 */
export async function countComponentFilesByPackage(
  rootDir: string,
  packages: WorkspacePackage[],
): Promise<Map<string, number>> {
  const [files, packageJsons] = await Promise.all([
    fg([COMPONENT_FILE_GLOB], { cwd: rootDir, onlyFiles: true, ignore: COUNT_IGNORE }),
    fg(["**/package.json"], { cwd: rootDir, onlyFiles: true, ignore: ["**/node_modules/**"] }),
  ]);
  const packageJsonPaths = new Set(packageJsons);
  const byDepth = [...packages]
    .filter(p => p.relDir !== "")
    .sort((a, b) => b.relDir.length - a.relDir.length);

  const counts = new Map<string, number>();
  for (const file of files) {
    const owner = byDepth.find(p => file.startsWith(`${p.relDir}/`));
    if (owner === undefined) continue;
    // A `package.json` between the owner and the file marks a boundary the
    // longest-prefix walk went straight past: scaffolding templates, vendored
    // copies, example projects. Those files are not the owner's source.
    if (!fileBelongsToOwner(file, owner.relDir, packageJsonPaths)) continue;
    counts.set(owner.name, (counts.get(owner.name) ?? 0) + 1);
  }
  return counts;
}
