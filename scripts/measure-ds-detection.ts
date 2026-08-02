/**
 * measure:ds-detection — what does `identifyDsFamily` decide on the 26-repo
 * bench corpus, and which packages does its disqualifier throw away?
 *
 * A MEASUREMENT, not a gate. It exists to answer one question before anyone
 * edits `APP_OR_SITE_DIR_SEGMENTS`: on how many repos does detection currently
 * find no design system at all, and on those, is the design system sitting in a
 * directory the disqualifier rejects?
 *
 * Widening that disqualifier is the obvious way to make shadcn/ui work — its
 * components live under `apps/www/registry`. It is also the dangerous way: the
 * segment set was calibrated against this exact corpus with every removal
 * verified on disk, so loosening it puts the 25 repos that already work at
 * risk. The safe shape, if the numbers support it, is a FALLBACK that runs only
 * when the current logic finds nothing — strictly additive, no regression
 * surface. This script produces the numbers that decide between the two.
 *
 *   pnpm measure:ds-detection            # table
 *   pnpm measure:ds-detection --json     # machine-readable
 */
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  countComponentFilesByPackage,
  identifyDsFamily,
} from "../packages/core/src/detection/ds-packages.js";
import { enumerateWorkspacePackages } from "../packages/core/src/detection/from-package-json.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS = process.env["BENCH_CORPUS"] ?? join(REPO_ROOT, ".bench-corpus");
const AS_JSON = process.argv.includes("--json");

interface Row {
  repo: string;
  workspacePackages: number;
  isDesignSystem: boolean;
  primary: string | null;
  members: number;
  /** Packages the disqualifier rejected that hold real component-shaped files. */
  rejectedWithEvidence: { name: string; reason: string; files: number }[];
  /** Present only for repos with no workspace at all — the single-package shape. */
  singlePackage?: {
    name: string | null;
    private: boolean;
    hasPublicEntry: boolean;
    componentFilesAnywhere: number;
    topDirs: string;
  };
  /** Simulated result if `app-or-site-directory` stopped disqualifying. */
  widened?: { primary: string | null; members: number };
}

async function measure(repo: string): Promise<Row> {
  const dir = join(CORPUS, repo);
  let pkg: unknown = null;
  try {
    pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    pkg = null;
  }
  const empty: Row = {
    repo, workspacePackages: 0, isDesignSystem: false, primary: null, members: 0,
    rejectedWithEvidence: [],
  };
  if (pkg === null || typeof pkg !== "object") return empty;

  const packages = await enumerateWorkspacePackages(pkg as Parameters<typeof enumerateWorkspacePackages>[0], dir);
  if (packages.length === 0) {
    // No workspace at all. These repos can only ever be single-package design
    // systems, and detection has no branch for that shape today. Record the
    // evidence that would decide one: a published entry, not private, and real
    // component-shaped files.
    const self = pkg as { name?: unknown; private?: unknown; exports?: unknown; main?: unknown; module?: unknown };
    // `countComponentFilesByPackage` attributes by `relDir + "/"` prefix and
    // skips relDir === "", so there is no way to ask it for "the whole repo".
    // Enumerate the top-level directories and let it attribute to those, which
    // keeps the same glob and the same ignore list as real detection.
    const topLevel = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => ({ name: e.name, relDir: e.name, private: false, hasPublicEntry: false }));
    const counts = await countComponentFilesByPackage(dir, topLevel);
    const total = [...counts.values()].reduce((n, v) => n + v, 0);
    const bySize = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      ...empty,
      singlePackage: {
        name: typeof self.name === "string" ? self.name : null,
        private: self.private === true,
        hasPublicEntry: self.exports !== undefined || self.main !== undefined || self.module !== undefined,
        componentFilesAnywhere: total,
        topDirs: bySize.map(([d, n]) => `${d}:${n}`).join(" "),
      },
    };
  }

  const counts = await countComponentFilesByPackage(dir, packages);
  const family = identifyDsFamily(packages, counts);

  const rejectedWithEvidence = Object.entries(family.evidence)
    .filter(([, e]) => e.disqualifiedBy !== null && e.componentFiles > 0)
    .map(([name, e]) => ({ name, reason: e.disqualifiedBy as string, files: e.componentFiles }))
    .sort((a, b) => b.files - a.files);

  // Simulate the widening: `app-or-site-directory` stops disqualifying, every
  // other rule stands. Survivor test and primary order are `identifyDsFamily`'s
  // and `choosePrimary`'s, restated here because both are module-private.
  const widenedSurvivors = packages.filter((p) => {
    const e = family.evidence[p.name];
    if (e === undefined) return false;
    if (e.disqualifiedBy !== null && e.disqualifiedBy !== "app-or-site-directory") return false;
    return (counts.get(p.name) ?? 0) >= 1;
  });
  const widenedPrimary = [...widenedSurvivors].sort((a, b) => {
    if (a.hasPublicEntry !== b.hasPublicEntry) return a.hasPublicEntry ? -1 : 1;
    const fa = counts.get(a.name) ?? 0;
    const fb = counts.get(b.name) ?? 0;
    if (fa !== fb) return fb - fa;
    const da = a.relDir.split("/").length;
    const db = b.relDir.split("/").length;
    if (da !== db) return da - db;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  })[0];

  return {
    repo,
    workspacePackages: packages.length,
    isDesignSystem: family.isDesignSystem,
    primary: family.primary,
    members: family.members.length,
    rejectedWithEvidence,
    widened: { primary: widenedPrimary?.name ?? null, members: widenedSurvivors.length },
  };
}

async function main(): Promise<void> {
  if (!existsSync(CORPUS)) {
    process.stderr.write(`corpus not found at ${CORPUS} — run pnpm bench:clone first\n`);
    process.exitCode = 1;
    return;
  }
  const repos = readdirSync(CORPUS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const rows: Row[] = [];
  for (const repo of repos) rows.push(await measure(repo));

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(
    `${pad("repo", 24)}${pad("pkgs", 6)}${pad("isDS", 6)}${pad("memb", 6)}${pad("primary", 28)}rejected-holding-components\n`,
  );
  for (const r of rows) {
    const rejected = r.rejectedWithEvidence
      .slice(0, 2)
      .map((x) => `${x.name}(${x.files},${x.reason})`)
      .join(" ");
    const more = r.rejectedWithEvidence.length > 2 ? ` +${r.rejectedWithEvidence.length - 2}` : "";
    process.stdout.write(
      pad(r.repo, 24) + pad(String(r.workspacePackages), 6) +
        pad(r.isDesignSystem ? "yes" : "NO", 6) + pad(String(r.members), 6) +
        pad(r.primary ?? "-", 28) + rejected + more + "\n",
    );
  }

  const failing = rows.filter((r) => !r.isDesignSystem);
  const noWorkspace = failing.filter((r) => r.workspacePackages === 0);
  const failingWithRejects = failing.filter((r) => r.rejectedWithEvidence.length > 0);
  process.stdout.write(
    `\n${rows.length} repos · ${failing.length} where detection finds NO design system` +
      ` (${noWorkspace.length} have no workspace at all)` +
      ` · ${failingWithRejects.length} have disqualified packages holding component files\n`,
  );
  if (failingWithRejects.length > 0) {
    process.stdout.write(`\nOnly these can change under a fallback that runs when the current logic finds nothing:\n`);
    for (const r of failingWithRejects) {
      process.stdout.write(
        `  ${r.repo}: ${r.rejectedWithEvidence.map((x) => `${x.name} (${x.files} files, ${x.reason})`).join(", ")}\n`,
      );
    }
  }

  const singles = rows.filter((r) => r.singlePackage !== undefined);
  if (singles.length > 0) {
    process.stdout.write(
      `\nRepos with NO workspace — detection has no branch for this shape at all.\n` +
        `A single-package design system is published (public entry, not private) and holds real components:\n`,
    );
    for (const r of singles) {
      const s = r.singlePackage!;
      const verdict = !s.private && s.hasPublicEntry && s.componentFilesAnywhere > 0 ? "LOOKS LIKE A DS" : "no";
      process.stdout.write(
        `  ${r.repo.padEnd(24)} name=${(s.name ?? "-").padEnd(28)} private=${String(s.private).padEnd(6)}` +
          ` publicEntry=${String(s.hasPublicEntry).padEnd(6)} components=${String(s.componentFilesAnywhere).padEnd(6)} [${s.topDirs}] ${verdict}\n`,
      );
    }
  }

  // The blast radius of the ALTERNATIVE — widening the disqualifier itself.
  // Simulated, not assumed: re-run survivor selection and `choosePrimary`'s
  // documented order (public entry, then component files, then directory depth,
  // then name) with `app-or-site-directory` treated as non-disqualifying.
  const changed = rows.filter((r) => r.widened !== undefined && r.widened.primary !== r.primary);
  process.stdout.write(
    `\nIf \`app-or-site-directory\` stopped disqualifying, the LABEL would change on ` +
      `${changed.length} of ${rows.length} repos:\n`,
  );
  for (const r of changed) {
    process.stdout.write(
      `  ${r.repo.padEnd(24)} ${String(r.primary).padEnd(30)} -> ${r.widened!.primary} ` +
        `(members ${r.members} -> ${r.widened!.members})\n`,
    );
  }
  const grew = rows.filter((r) => r.widened !== undefined && r.widened.members > r.members);
  process.stdout.write(
    `\nAnd the FAMILY would grow on ${grew.length} repos, admitting docs sites and demo apps as design-system members.\n`,
  );
}

await main();
