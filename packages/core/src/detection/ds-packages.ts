import type { DsFamily, DsFamilyMember, DsPackageEvidence, WorkspacePackage } from "./types.js";

/**
 * Pinned by the benchmark corpus, not chosen: radix's real DS packages
 * (`@radix-ui/react-tabs`, `@radix-ui/react-presence`, …) each hold exactly two
 * component-shaped files. A threshold of 3 would exclude radix's whole family.
 */
export const MIN_COMPONENT_FILES = 2;

const APP_OR_SITE_DIR_SEGMENTS = new Set([
  "apps", "docs", "site", "sites", "website", "playground", "playgrounds", "examples", "templates", "e2e",
]);

const DOCS_OR_SITE_NAME_RE = /(-website|-docs|-site)$|\.(com|dev|io)$|^@docs\//;
const TEST_OR_TOOLING_NAME_RE = /^@[^/]*-tests?\//;
const TEST_OR_TOOLING_SUFFIXES = [
  "-internal", "-test-utils", "-tests", "-test", "-tooling", "-build", "-scripts", "-codemods",
];

/**
 * The first disqualifying rule that applies, or null. Order is part of the
 * contract: `evidence[name].disqualifiedBy` names exactly one reason, and tests
 * pin which one, so reordering these branches is a behaviour change.
 */
function disqualify(pkg: WorkspacePackage): string | null {
  if (pkg.relDir === "") return "workspace-root";
  const segments = pkg.relDir.split("/");
  if (segments.some(s => APP_OR_SITE_DIR_SEGMENTS.has(s.toLowerCase()))) return "app-or-site-directory";
  if (pkg.name === "docs" || DOCS_OR_SITE_NAME_RE.test(pkg.name)) return "docs-or-site-name";
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
  const evidence: Record<string, DsPackageEvidence> = {};
  const survivors: WorkspacePackage[] = [];

  for (const pkg of packages) {
    const componentFiles = componentFileCounts.get(pkg.name) ?? 0;
    const disqualifiedBy = disqualify(pkg);
    evidence[pkg.name] = {
      componentFiles,
      hasPublicEntry: pkg.hasPublicEntry,
      private: pkg.private,
      disqualifiedBy,
    };
    if (disqualifiedBy !== null) continue;
    // Component files are the ONLY qualifying evidence. A declared public entry
    // is not enough on its own — a published utility package would otherwise
    // join the family. It contributes to `primary` selection instead.
    if (componentFiles >= MIN_COMPONENT_FILES) survivors.push(pkg);
  }

  if (survivors.length === 0) {
    return { isDesignSystem: false, members: [], primary: null, evidence };
  }

  const members: DsFamilyMember[] = survivors
    .map(p => ({ name: p.name, relDir: p.relDir }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { isDesignSystem: true, members, primary: choosePrimary(survivors), evidence };
}

/**
 * A total order so the label is stable, not an attempt to name "the" design
 * system: public entry first, then shallowest directory, then name.
 */
function choosePrimary(candidates: WorkspacePackage[]): string {
  const [best] = [...candidates].sort((a, b) => {
    if (a.hasPublicEntry !== b.hasPublicEntry) return a.hasPublicEntry ? -1 : 1;
    const depthA = a.relDir.split("/").length;
    const depthB = b.relDir.split("/").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return best?.name ?? "";
}
