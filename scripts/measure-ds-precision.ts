/**
 * measure:ds-precision — run design-system detection against repositories where
 * the correct answer is **no**, and count how often it says yes anyway.
 *
 * Every corpus in this repo is made of design systems, so every precision figure
 * computed on them is computed with no way to be wrong: a detector that answered
 * "yes, design system" for every repository on earth would score perfectly. This
 * is the other half, and it is the only thing that makes a false positive
 * visible.
 *
 *   pnpm measure:ds-precision
 *   pnpm measure:ds-precision --json
 *
 * Reports, and deliberately does NOT fail, on a false positive: every negative
 * in the corpus is a known false positive today (see the issue this landed with),
 * so gating here would mean a permanently red check nobody reads. It fails when
 * it could not measure — an empty or unfetchable corpus is not a pass.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NEGATIVE_CORPUS, type NegativeRepo } from "../packages/core/tests/generalization/negatives.js";
import { fetchGoldenRepo } from "../packages/core/tests/golden/fetch.js";
import { countComponentFilesByPackage, identifyDsFamily } from "../packages/core/src/detection/ds-packages.js";
import { enumerateWorkspacePackages } from "../packages/core/src/detection/from-package-json.js";

const AS_JSON = process.argv.includes("--json");

interface Row {
  repo: string;
  reason: string;
  /** What detection said. `true` here is a FALSE POSITIVE by construction. */
  saidDesignSystem: boolean;
  primary: string | null;
  members: number;
  /** The evidence that carried the wrong verdict — the files, and how few. */
  primaryComponentFiles: number;
  fetched: boolean;
}

async function measure(repo: NegativeRepo): Promise<Row> {
  const base: Row = {
    repo: repo.label, reason: repo.reason, saidDesignSystem: false,
    primary: null, members: 0, primaryComponentFiles: 0, fetched: false,
  };
  const dir = await fetchGoldenRepo(repo);
  if (dir === null) return base;

  let pkg: unknown = null;
  try {
    pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    return { ...base, fetched: true };
  }
  if (pkg === null || typeof pkg !== "object") return { ...base, fetched: true };

  const packages = await enumerateWorkspacePackages(
    pkg as Parameters<typeof enumerateWorkspacePackages>[0],
    dir,
  );
  if (packages.length === 0) return { ...base, fetched: true };

  const counts = await countComponentFilesByPackage(dir, packages);
  const family = identifyDsFamily(packages, counts);
  return {
    ...base,
    fetched: true,
    saidDesignSystem: family.isDesignSystem,
    primary: family.primary,
    members: family.members.length,
    primaryComponentFiles: family.primary === null ? 0 : (counts.get(family.primary) ?? 0),
  };
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  for (const repo of NEGATIVE_CORPUS) {
    process.stderr.write(`  ${repo.label}…\n`);
    rows.push(await measure(repo));
  }

  if (AS_JSON) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }

  const measured = rows.filter((r) => r.fetched);
  const falsePositives = measured.filter((r) => r.saidDesignSystem);

  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(
    `${pad("repo", 14)}${pad("verdict", 20)}${pad("primary", 28)}files\n`,
  );
  for (const r of rows) {
    process.stdout.write(
      pad(r.repo, 14) +
        pad(!r.fetched ? "NOT FETCHED" : r.saidDesignSystem ? "FALSE POSITIVE" : "correct (not a DS)", 20) +
        pad(r.primary ?? "-", 28) +
        (r.saidDesignSystem ? String(r.primaryComponentFiles) : "") +
        "\n",
    );
  }

  process.stdout.write(
    `\n${falsePositives.length} false positive${falsePositives.length === 1 ? "" : "s"} ` +
      `of ${measured.length} measured (${rows.length - measured.length} not fetched)\n`,
  );
  for (const r of falsePositives) {
    process.stdout.write(`\n  ${r.repo}: detection says "${r.primary}" is a design system.\n`);
    process.stdout.write(`    Ground truth: ${r.reason}\n`);
    process.stdout.write(`    Carried by ${r.primaryComponentFiles} component-shaped file(s).\n`);
  }

  if (measured.length === 0) {
    process.stdout.write("\nFAIL: nothing was measured — an unfetchable corpus is not a pass.\n");
    process.exitCode = 1;
  }
}

await main();
