/**
 * ecosystem:diff — run the binary built from a baseline ref and the binary built
 * from this working tree over the same pinned real repositories, and report
 * every behavioural difference.
 *
 * No ground truth is needed and none is claimed: this says what CHANGED, and a
 * human decides whether the change is an improvement. Its blind spot is the
 * mirror image of `bench-golden`'s: it cannot see a defect that is stably
 * present in both binaries.
 *
 *   pnpm ecosystem:diff                       # vs origin/main
 *   BASELINE_REF=v0.2.0 pnpm ecosystem:diff   # vs any ref
 *   pnpm ecosystem:diff --markdown            # PR-comment form
 *
 * Exits 0 whatever it finds — a diff is information, not a verdict. It exits 1
 * only when it could not do its job (baseline build failed, nothing compared).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GOLDEN_CORPUS, type GoldenRepo } from "../../packages/core/tests/golden/corpus.js";
import { GENERALIZATION_CORPUS } from "../../packages/core/tests/generalization/corpus.js";
import { fetchGoldenRepo } from "../../packages/core/tests/golden/fetch.js";
import { summarize, diffSummaries, renderReport, type RepoDiff } from "./summary.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE_REF = process.env["BASELINE_REF"] ?? "origin/main";
const WORK_DIR = process.env["ECOSYSTEM_DIFF_DIR"] ?? join(REPO_ROOT, ".ecosystem-diff");
const AS_MARKDOWN = process.argv.includes("--markdown");

/** Both corpora, deduplicated by label — every repo is already pinned by SHA. */
function corpus(): GoldenRepo[] {
  const seen = new Set<string>();
  const out: GoldenRepo[] = [];
  for (const repo of [...GOLDEN_CORPUS, ...GENERALIZATION_CORPUS]) {
    if (seen.has(repo.label)) continue;
    seen.add(repo.label);
    out.push(repo);
  }
  const only = process.env["ECOSYSTEM_DIFF_ONLY"];
  const filtered = only === undefined
    ? out
    : out.filter((r) => only.split(",").map((s) => s.trim()).includes(r.label));
  return filtered.sort((a, b) => (a.label < b.label ? -1 : 1));
}

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * A checkout of `ref` with its own build. A worktree rather than a clone so the
 * object store is shared; `pnpm install` still has to run, because the baseline
 * may have different dependencies than the working tree.
 */
function buildBaseline(): string {
  const dir = join(WORK_DIR, "baseline");
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(WORK_DIR, { recursive: true });

  log(`building baseline from ${BASELINE_REF}…`);
  execFileSync("git", ["worktree", "add", "--detach", dir, BASELINE_REF], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: dir, stdio: "inherit" });
  execFileSync("pnpm", ["-F", "lyse", "build"], { cwd: dir, stdio: "inherit" });
  return join(dir, "packages", "core", "dist", "cli.js");
}

function cleanupBaseline(): void {
  const dir = join(WORK_DIR, "baseline");
  if (!existsSync(dir)) return;
  try {
    execFileSync("git", ["worktree", "remove", "--force", dir], { cwd: REPO_ROOT, stdio: "ignore" });
  } catch {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `null` when the audit could not produce parseable JSON — never silently `{}`. */
function audit(cli: string, dir: string): unknown | null {
  try {
    const stdout = execFileSync(process.execPath, [cli, "audit", dir, "--json", "--static-only"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const repos = corpus();
  log(`ecosystem diff — ${repos.length} repositories, baseline ${BASELINE_REF}\n`);

  let baselineCli: string;
  try {
    baselineCli = buildBaseline();
  } catch (err) {
    log(`FAIL: could not build the baseline: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const currentCli = join(REPO_ROOT, "packages", "core", "dist", "cli.js");
  if (!existsSync(currentCli)) {
    log(`FAIL: no current build at ${currentCli} — run \`pnpm -F lyse build\` first`);
    cleanupBaseline();
    process.exitCode = 1;
    return;
  }

  const diffs: RepoDiff[] = [];
  for (const repo of repos) {
    log(`  ${repo.label}…`);
    const root = await fetchGoldenRepo(repo);
    if (root === null) {
      diffs.push({ repo: repo.label, lines: [], failed: "checkout could not be fetched" });
      continue;
    }
    const target = repo.auditSubpath === "." ? root : join(root, repo.auditSubpath);
    const before = audit(baselineCli, target);
    const after = audit(currentCli, target);
    if (before === null || after === null) {
      const which = before === null && after === null ? "both binaries" : before === null ? "the baseline" : "this branch";
      diffs.push({ repo: repo.label, lines: [], failed: `audit produced no parseable JSON on ${which}` });
      continue;
    }
    diffs.push({
      repo: repo.label,
      lines: diffSummaries(summarize(repo.label, before), summarize(repo.label, after)),
    });
  }

  cleanupBaseline();

  const report = renderReport(diffs, BASELINE_REF);
  process.stdout.write(AS_MARKDOWN ? `${report}\n` : `\n${report}\n`);

  if (diffs.every((d) => d.failed !== undefined)) {
    log("\nFAIL: no repository was compared.");
    process.exitCode = 1;
  }
}

await main();
