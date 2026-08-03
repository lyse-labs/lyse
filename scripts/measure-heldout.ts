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

interface AxisRow { abstentionReason: string | null; axis: string; opportunities: number; score: number | "N/A" }
interface PositiveRow {
  axes: AxisRow[];
  error: string | null;
  /**
   * Tokens and components the graph actually extracted. An empty directory
   * audits cleanly and still reports nine findings — the repo-level structural
   * rules fire on the absence of a CHANGELOG, an llms.txt and so on — so a
   * finding count cannot distinguish a measured repository from an empty one.
   * This can.
   */
  extracted: { components: number; tokens: number } | null;
  fetched: boolean;
  /** Files the audit walker scanned. Zero with a populated checkout means Lyse
   * could not reach the source at all — magicui, whose entire library sits
   * under `apps/www`, scans zero of its 955 files. */
  fileCount: number | null;
  findingsByRule: Record<string, number>;
  framework: string;
  maturity: string;
  repo: string;
  score: number | "N/A" | null;
  stack: string;
}
interface NegativeRow {
  correct: boolean | null;
  error: string | null;
  fetched: boolean;
  framework: string;
  primary: string | null;
  primaryComponentFiles: number;
  reason: string;
  repo: string;
  saidDesignSystem: boolean;
  undeterminedReason: string | null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function measurePositive(repo: (typeof HELDOUT_CORPUS)[number]): Promise<PositiveRow> {
  const base: PositiveRow = {
    axes: [], error: null, extracted: null, fetched: false, fileCount: null,
    findingsByRule: {}, framework: repo.framework, maturity: repo.maturity,
    repo: repo.label, score: null, stack: repo.stack,
  };
  const dir = await fetchGoldenRepo(repo);
  if (dir === null) return base;
  const afterFetch: PositiveRow = { ...base, fetched: true };
  try {
    const audited = repo.auditSubpath === "." ? dir : join(dir, repo.auditSubpath);
    const { result, graph, fileCount } = await auditDirectory(audited, { staticOnly: true });
    const findingsByRule: Record<string, number> = {};
    for (const f of result.findings) {
      findingsByRule[f.ruleId] = (findingsByRule[f.ruleId] ?? 0) + 1;
    }
    return {
      ...afterFetch,
      axes: result.axes.map((a) => ({
        abstentionReason: a.abstentionReason ?? null,
        axis: a.axis,
        opportunities: a.opportunities,
        score: a.score,
      })),
      extracted: { components: graph.components.length, tokens: graph.tokens.length },
      fileCount,
      findingsByRule: Object.fromEntries(
        Object.entries(findingsByRule).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      score: result.finalScore,
    };
  } catch (err) {
    return { ...afterFetch, error: errorMessage(err) };
  }
}

async function measureNegative(repo: (typeof HELDOUT_NEGATIVES)[number]): Promise<NegativeRow> {
  const base: NegativeRow = {
    correct: null, error: null, fetched: false, framework: repo.framework, primary: null,
    primaryComponentFiles: 0, reason: repo.reason, repo: repo.label, saidDesignSystem: false,
    undeterminedReason: "fetch failed",
  };
  const dir = await fetchGoldenRepo(repo);
  if (dir === null) return base;
  const audited = repo.auditSubpath === "." ? dir : join(dir, repo.auditSubpath);
  const afterFetch: NegativeRow = { ...base, fetched: true, undeterminedReason: null };
  try {
    let pkg: unknown;
    try {
      pkg = JSON.parse(await readFile(join(audited, "package.json"), "utf8"));
    } catch {
      return { ...afterFetch, undeterminedReason: "no package.json at the audit root" };
    }
    if (pkg === null || typeof pkg !== "object") {
      return { ...afterFetch, undeterminedReason: "no package.json at the audit root" };
    }
    const packages = await enumerateWorkspacePackages(
      pkg as Parameters<typeof enumerateWorkspacePackages>[0],
      audited,
    );
    if (packages.length === 0) {
      return { ...afterFetch, undeterminedReason: "declares no workspace, so family detection never ran" };
    }
    const counts = await countComponentFilesByPackage(audited, packages);
    const family = identifyDsFamily(packages, counts);
    return {
      ...afterFetch,
      saidDesignSystem: family.isDesignSystem,
      correct: !family.isDesignSystem,
      primary: family.primary,
      primaryComponentFiles: family.primary === null ? 0 : (counts.get(family.primary) ?? 0),
    };
  } catch (err) {
    return {
      ...afterFetch,
      error: errorMessage(err),
      undeterminedReason: "detection threw before producing a verdict",
    };
  }
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

  const failed = [...positives, ...negatives].filter((r) => r.error !== null).length;
  process.stderr.write(
    `${failed} of ${positives.length + negatives.length} repositories failed with an unexpected error.\n`,
  );

  // An empty directory audits cleanly and still reports nine findings — the
  // repo-level structural rules fire on the absence of a CHANGELOG, an llms.txt
  // and so on — so neither `fetched` nor `error` nor a finding count separates a
  // measured repository from an empty one. Extraction evidence does.
  const vacuous = positives.filter(
    (p) => p.fetched && p.error === null && (p.extracted?.components ?? 0) + (p.extracted?.tokens ?? 0) === 0,
  );
  if (vacuous.length > 0) {
    process.stderr.write(
      `${vacuous.length} of ${positives.length} positives extracted no tokens and no components: ` +
        `${vacuous.map((p) => p.repo).join(", ")}.\n`,
    );
  }

  // Reported separately from `vacuous` because the causes are different and so
  // are the fixes: extracting nothing from files Lyse read is an extractor gap,
  // reading no files at all is a reach gap — the walker never saw the source.
  const unreached = positives.filter((p) => p.fetched && p.error === null && p.fileCount === 0);
  if (unreached.length > 0) {
    process.stderr.write(
      `${unreached.length} of ${positives.length} positives had ZERO files scanned — ` +
        `Lyse never reached their source: ${unreached.map((p) => p.repo).join(", ")}.\n`,
    );
  }

  const negativesDetectionRan = negatives.filter((n) => n.undeterminedReason === null);
  const falsePositives = negativesDetectionRan.filter((n) => n.saidDesignSystem);
  const undetermined = negatives.filter((n) => n.undeterminedReason !== null);
  process.stderr.write(
    `${negativesDetectionRan.length} of ${negatives.length} negatives had detection run; ` +
      `${falsePositives.length} of those ${negativesDetectionRan.length} were called design systems; ` +
      `${undetermined.length} of ${negatives.length} were undetermined.\n`,
  );

  if (measuredPositives === 0 || measuredNegatives === 0) {
    const empty = [
      measuredPositives === 0 ? "positives" : null,
      measuredNegatives === 0 ? "negatives" : null,
    ].filter((half): half is string => half !== null);
    process.stderr.write(
      `FAIL: nothing was measured for ${empty.join(" and ")} — an unfetchable corpus is not a pass.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const json = `${JSON.stringify(report, null, 2)}\n`;
  // Written before the failure check below: per-repository containment exists so
  // one bad repo does not discard the other fourteen, and discarding the report
  // here would undo that. The exit code carries the incompleteness instead — an
  // audit that threw on every repository still fetches, so `fetched` alone
  // cannot distinguish a complete run from a totally broken one.
  if (TO_STDOUT) {
    process.stdout.write(json);
  } else {
    const outDir = join(repoRoot, ".superpowers", "measurements");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `heldout-${sha}.json`);
    writeFileSync(outPath, json);
    process.stderr.write(`\nWrote ${outPath}\n`);
  }

  // Failing on SOME positive extracting nothing would gate on a result, not on
  // the harness: Lyse reading nothing out of ant-design is a finding this corpus
  // exists to surface, and a permanently red command is one nobody reads —
  // the rule `measure:ds-precision` already states. Failing on ALL of them is
  // different: that is the harness broken, and it is indistinguishable from a
  // clean run by every other signal. `negativesDetectionRan` mirrors this on the
  // negative half: coolify alone declaring no workspace is a result and must stay
  // green, but NONE of the five ever reaching detection means that half was never
  // measured — `measuredNegatives` cannot tell the two apart, since it counts
  // `fetched`, which an empty directory satisfies too.
  if (failed > 0 || vacuous.length === positives.length || negativesDetectionRan.length === 0) {
    const why =
      failed > 0
        ? `${failed} repositor${failed === 1 ? "y" : "ies"} failed with an unexpected error`
        : vacuous.length === positives.length
          ? "not one positive extracted anything, so nothing was measured"
          : "not one negative had detection run, so nothing was measured";
    process.stderr.write(`FAIL: ${why} — do not publish a number from this report.\n`);
    process.exitCode = 1;
  }
}

await main();
