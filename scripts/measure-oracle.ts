/**
 * measure:oracle — check what Lyse claims about real repositories against
 * ground truth established by reading those repositories, not by running Lyse.
 *
 * This is deliberately NOT a vitest suite and NOT gate-eligible. It needs
 * multi-hundred-megabyte checkouts, so it runs locally or nightly; CI's share
 * of the oracle is `packages/core/tests/oracle/must-never-be-true.test.ts`,
 * which encodes the same contracts on synthetic fixtures.
 *
 *   pnpm measure:oracle                  # audit whatever is already on disk
 *   pnpm measure:oracle --clone          # clone anything missing first
 *   ORACLE_DIR=/path pnpm measure:oracle # look for checkouts elsewhere
 *
 * Exit code 1 when any repo's reported component count falls outside tolerance,
 * so an unattended loop can use it as a signal. A skipped repo (not on disk) is
 * reported and does not fail the run — silence about what was NOT measured is
 * the failure mode this whole harness exists to prevent.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditDirectory } from "../packages/core/src/commands/audit-pipeline.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECKOUT_DIR = process.env["ORACLE_DIR"] ?? join(REPO_ROOT, ".oracle-corpus");
const SHOULD_CLONE = process.argv.includes("--clone");

interface Expectation {
  name: string;
  git: string;
  heldOut: boolean;
  componentsDir: string;
  components: number;
  storyFiles: number;
  framework: string;
  isDesignSystem: boolean;
}

interface Expectations {
  establishedOn: string;
  repos: Expectation[];
  tolerance: { factorLow: number; factorHigh: number; notADesignSystemMax: number };
}

const spec = JSON.parse(
  readFileSync(join(REPO_ROOT, "scripts", "oracle-expectations.json"), "utf8"),
) as Expectations;

type Verdict = "ok" | "out-of-tolerance" | "skipped";

interface Row {
  name: string;
  heldOut: boolean;
  expected: number;
  reported: number | null;
  score: number | "N/A" | null;
  verdict: Verdict;
  note: string;
}

function clone(repo: Expectation, into: string): boolean {
  process.stderr.write(`  cloning ${repo.name}…\n`);
  try {
    execFileSync("git", ["clone", "--depth", "1", "--quiet", repo.git, into], { stdio: "inherit" });
    return true;
  } catch {
    process.stderr.write(`  clone failed: ${repo.name}\n`);
    return false;
  }
}

function withinTolerance(repo: Expectation, reported: number): boolean {
  if (!repo.isDesignSystem) return reported <= spec.tolerance.notADesignSystemMax;
  const low = repo.components / spec.tolerance.factorLow;
  const high = repo.components * spec.tolerance.factorHigh;
  return reported >= low && reported <= high;
}

async function main(): Promise<void> {
  mkdirSync(CHECKOUT_DIR, { recursive: true });
  process.stderr.write(
    `oracle — ground truth established ${spec.establishedOn}, checkouts under ${CHECKOUT_DIR}\n\n`,
  );

  const rows: Row[] = [];
  for (const repo of spec.repos) {
    const dir = join(CHECKOUT_DIR, repo.name);
    if (!existsSync(dir)) {
      if (!SHOULD_CLONE || !clone(repo, dir)) {
        rows.push({
          name: repo.name, heldOut: repo.heldOut, expected: repo.components,
          reported: null, score: null, verdict: "skipped",
          note: SHOULD_CLONE ? "clone failed" : "not on disk (pass --clone)",
        });
        continue;
      }
    }

    const { result, graph } = await auditDirectory(dir, {});
    const reported = graph.components.length;
    const ok = withinTolerance(repo, reported);
    const degraded = graph.extraction.entries
      .filter((e) => e.status !== "ok")
      .map((e) => e.extractor)
      .join(",");
    rows.push({
      name: repo.name,
      heldOut: repo.heldOut,
      expected: repo.components,
      reported,
      score: result.finalScore,
      verdict: ok ? "ok" : "out-of-tolerance",
      note: degraded ? `degraded: ${degraded}` : "",
    });
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(
    `${pad("repo", 16)}${pad("held out", 10)}${pad("truth", 8)}${pad("lyse", 8)}${pad("score", 8)}${pad("verdict", 18)}note\n`,
  );
  for (const r of rows) {
    process.stdout.write(
      pad(r.name, 16) +
        pad(r.heldOut ? "yes" : "no", 10) +
        pad(String(r.expected), 8) +
        pad(r.reported === null ? "-" : String(r.reported), 8) +
        pad(r.score === null ? "-" : String(r.score), 8) +
        pad(r.verdict, 18) +
        r.note +
        "\n",
    );
  }

  const failed = rows.filter((r) => r.verdict === "out-of-tolerance");
  const skipped = rows.filter((r) => r.verdict === "skipped");
  process.stdout.write(
    `\n${rows.length - failed.length - skipped.length} within tolerance · ${failed.length} out · ${skipped.length} not measured\n`,
  );
  if (skipped.length > 0) {
    process.stdout.write(`NOT MEASURED: ${skipped.map((r) => r.name).join(", ")}\n`);
  }
  process.exitCode = failed.length > 0 ? 1 : 0;
}

await main();
