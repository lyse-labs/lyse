/**
 * measure:heldout — audit the held-out corpus, on demand only.
 *
 * Two outputs and no third: scores for the ten positives (the out-of-sample
 * counterpart to the in-sample figures docs/methodology.md discloses), and
 * detection verdicts for the five negatives (the precision half of #269 at a
 * sample above four).
 *
 * It reports NO precision on findings. That needs labels, labels need a round
 * under docs/measurement/labeling-protocol.md, and a script printing a precision
 * figure with no labeller behind it would be the exact circularity the protocol
 * was written to end.
 *
 *   pnpm measure:heldout            # writes .superpowers/measurements/heldout-<sha>.json
 *   pnpm measure:heldout --stdout   # prints the report instead
 *
 * The report never belongs in this public repository. `.superpowers/` is
 * gitignored; archive anything worth keeping to lyse-labs/lyse-internal.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HELDOUT_CORPUS, HELDOUT_NEGATIVES } from "../packages/core/tests/heldout/corpus.js";
import { fetchGoldenRepo } from "../packages/core/tests/golden/fetch.js";
import { auditDirectory } from "../packages/core/src/commands/audit-pipeline.js";
import { countComponentFilesByPackage, identifyDsFamily } from "../packages/core/src/detection/ds-packages.js";
import { enumerateWorkspacePackages } from "../packages/core/src/detection/from-package-json.js";

const TO_STDOUT = process.argv.includes("--stdout");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface AxisRow { axis: string; opportunities: number; score: number | "N/A" }
interface PositiveRow {
  axes: AxisRow[];
  fetched: boolean;
  findingsByRule: Record<string, number>;
  framework: string;
  maturity: string;
  repo: string;
  score: number | "N/A" | null;
  stack: string;
}
interface NegativeRow {
  correct: boolean | null;
  fetched: boolean;
  framework: string;
  primary: string | null;
  primaryComponentFiles: number;
  reason: string;
  repo: string;
  saidDesignSystem: boolean;
}

async function measurePositive(repo: (typeof HELDOUT_CORPUS)[number]): Promise<PositiveRow> {
  const base: PositiveRow = {
    axes: [], fetched: false, findingsByRule: {}, framework: repo.framework,
    maturity: repo.maturity, repo: repo.label, score: null, stack: repo.stack,
  };
  const dir = await fetchGoldenRepo(repo);
  if (dir === null) return base;
  const { result } = await auditDirectory(dir, { staticOnly: true });
  const findingsByRule: Record<string, number> = {};
  for (const f of result.findings) {
    findingsByRule[f.ruleId] = (findingsByRule[f.ruleId] ?? 0) + 1;
  }
  return {
    ...base,
    fetched: true,
    score: result.finalScore,
    axes: result.axes.map((a) => ({ axis: a.axis, opportunities: a.opportunities, score: a.score })),
    findingsByRule: Object.fromEntries(Object.entries(findingsByRule).sort(([a], [b]) => a.localeCompare(b))),
  };
}

async function measureNegative(repo: (typeof HELDOUT_NEGATIVES)[number]): Promise<NegativeRow> {
  const base: NegativeRow = {
    correct: null, fetched: false, framework: repo.framework, primary: null,
    primaryComponentFiles: 0, reason: repo.reason, repo: repo.label, saidDesignSystem: false,
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
  if (packages.length === 0) return { ...base, correct: true, fetched: true };
  const counts = await countComponentFilesByPackage(dir, packages);
  const family = identifyDsFamily(packages, counts);
  return {
    ...base,
    fetched: true,
    saidDesignSystem: family.isDesignSystem,
    correct: !family.isDesignSystem,
    primary: family.primary,
    primaryComponentFiles: family.primary === null ? 0 : (counts.get(family.primary) ?? 0),
  };
}

function headSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const positives: PositiveRow[] = [];
  for (const repo of HELDOUT_CORPUS) {
    process.stderr.write(`  ${repo.label}…\n`);
    positives.push(await measurePositive(repo));
  }
  const negatives: NegativeRow[] = [];
  for (const repo of HELDOUT_NEGATIVES) {
    process.stderr.write(`  ${repo.label}…\n`);
    negatives.push(await measureNegative(repo));
  }

  const sha = headSha();
  const report = {
    corpus: "heldout",
    lyseCommit: sha,
    negatives,
    note: "No precision figure is reported. Precision needs labels; labels need a round under docs/measurement/labeling-protocol.md.",
    positives,
  };

  const measuredPositives = positives.filter((p) => p.fetched).length;
  const measuredNegatives = negatives.filter((n) => n.fetched).length;
  process.stderr.write(
    `\n${measuredPositives}/${positives.length} positives and ` +
      `${measuredNegatives}/${negatives.length} negatives measured.\n`,
  );
  const falsePositives = negatives.filter((n) => n.saidDesignSystem);
  process.stderr.write(
    `${falsePositives.length} of ${measuredNegatives} applications were called design systems.\n`,
  );

  if (measuredPositives === 0 && measuredNegatives === 0) {
    process.stderr.write("FAIL: nothing was measured — an unfetchable corpus is not a pass.\n");
    process.exitCode = 1;
    return;
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (TO_STDOUT) {
    process.stdout.write(json);
    return;
  }
  const outDir = join(repoRoot, ".superpowers", "measurements");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `heldout-${sha}.json`);
  writeFileSync(outPath, json);
  process.stderr.write(`\nWrote ${outPath}\n`);
}

await main();
