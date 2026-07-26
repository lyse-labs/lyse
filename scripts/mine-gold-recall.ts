#!/usr/bin/env tsx
/**
 * Gold-mining recall orchestrator.
 *
 * Reads the hand-curated `scripts/gold-corpus/color.yaml` corpus (real OSS
 * design-system repos + a pinned commit each), clones/pins each one, walks
 * its git history for tokenization commits (`walkTokenizationCommits`),
 * independently confirms which of those commits are genuinely
 * value-preserving hex->token migrations (`confirmCandidate` — Gate
 * A structural-slot + Gate B independent colour value-equality), then
 * measures whether TODAY's `no-hardcoded-color` rule actually catches each
 * confirmed historical drift (`measureGoldRecall`, checked out at the
 * label's PARENT commit). Buckets are merged across repos and written to
 * `packages/core/rules-recall-mined.json` as a `MinedRecallLedger`
 * (`recallSource: "git-mined"` — see `reliability/gold/types.ts`; this
 * source can NEVER be gate-eligible, see `tests/reliability/gold/non-gating.test.ts`).
 *
 * Usage: tsx scripts/mine-gold-recall.ts [--commit <sha>] [--at <iso>]
 *
 * Regenerate: pnpm --filter @lyse-labs/lyse exec tsx scripts/mine-gold-recall.ts --commit "$(git rev-parse --short HEAD)" --at "<ISO8601>"
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  confirmCandidate,
  resolveCssVarInRepo,
  type ResolveTokenValue,
} from "../packages/core/src/reliability/gold/confirm.js";
import { git } from "../packages/core/src/reliability/gold/git.js";
import { measureGoldRecall } from "../packages/core/src/reliability/gold/measure-gold-recall.js";
import type {
  GoldLabel,
  MinedRecallBucket,
  MinedRecallLedger,
} from "../packages/core/src/reliability/gold/types.js";
import { walkTokenizationCommits } from "../packages/core/src/reliability/gold/walk.js";
import { wilsonLowerBound } from "../packages/core/src/reliability/catalogue/promotion.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CORPUS_PATH = resolve(REPO_ROOT, "scripts/gold-corpus/color.yaml");
const OUT_PATH = join(REPO_ROOT, "packages/core/rules-recall-mined.json");

interface CorpusEntry {
  repo: string;
  url: string;
  sha: string;
  parent: string;
}

export function parseGoldCorpusYaml(yamlText: string): CorpusEntry[] {
  const doc = parseYaml(yamlText) as unknown;
  if (typeof doc !== "object" || doc === null || !("entries" in doc)) return [];
  const rawEntries = (doc as { entries: unknown }).entries;
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { repo, url, sha, parent } = item as Record<string, unknown>;
    if (
      typeof repo !== "string" ||
      typeof url !== "string" ||
      typeof sha !== "string" ||
      typeof parent !== "string"
    ) {
      return [];
    }
    return [{ repo, url, sha, parent }];
  });
}

// A per-repo first-parent walk bound. Real OSS histories can run into the
// thousands of commits (observed: polaris ~3,676 first-parent commits from
// its pinned sha); diffing every one of them is impractical in a bounded CI
// run. The bound is tied to the IMMUTABLE pinned `sha`, not to wall-clock —
// the same sha + the same bound always yields the same truncated history,
// forever, so this stays fully deterministic. Enforced via a local
// `git replace --graft` on the Nth first-parent ancestor of `sha` (making it
// parentless in THIS clone only); `walkTokenizationCommits`'s own
// `git log --first-parent --format=%H %P` then naturally stops there ---
// walk.ts is untouched.
const MAX_FIRST_PARENT_COMMITS = 400;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  const value = process.argv[i + 1];
  return i !== -1 && value !== undefined ? value : fallback;
}

// Independently-verified historical token values for the two "explicit
// expected" corpus fixtures whose token is defined in an EXTERNAL npm
// package rather than in-repo (`tests/reliability/gold/fixtures/expected.json`,
// curated during corpus mining: positive-css-var.diff / positive-js-token.diff).
// `resolveCssVarInRepo` alone returns [] for these (git-grep over the CLONED
// repo alone can never see an external package's source), so without this
// pin those two known-real migrations would be undercounted as "unresolved".
// This is NOT circular: it only supplies the historical TOKEN VALUE (what
// the token resolved to back then, verified independently against the
// pinned npm package version at the time) -- it says nothing about whether
// today's rule catches the drift, which is the wholly separate, genuinely
// independent question `measureGoldRecall` answers by re-running the CURRENT
// rule engine against the checked-out parent commit.
function pinnedKey(repo: string, commit: string, ref: string): string {
  return `${repo}${commit}${ref}`;
}

const KNOWN_EXTERNAL_TOKEN_VALUES: ReadonlyMap<string, string> = new Map([
  [
    pinnedKey(
      "primer-css",
      "8541ed1db1e0d9c4551ea76ba400d6d0cf682897",
      "var(--color-underlinenav-border-active)",
    ),
    "#f9826c", // @primer/primitives@4.3.5, dist/scss/colors/_light.scss:454
  ],
  [
    pinnedKey("canvas-kit", "30279d7c3d004668196c395d1fc3050cc6e373c6", "base.orange400"),
    "#FD7E00", // @workday/canvas-tokens-web@3.0.0-alpha.9 --cnvs-base-palette-orange-400 (OKLCH->sRGB)
  ],
]);

function makeResolveTokenValue(repoDir: string, repoName: string): ResolveTokenValue {
  return async (ref, commit) => {
    const pinned = KNOWN_EXTERNAL_TOKEN_VALUES.get(pinnedKey(repoName, commit, ref));
    if (pinned !== undefined) return [pinned];
    return resolveCssVarInRepo(repoDir, ref, commit);
  };
}

async function cloneAndPin(url: string, sha: string, dest: string): Promise<void> {
  await git(["clone", "--filter=blob:none", "--no-checkout", url, dest], REPO_ROOT);
  await git(["checkout", "-q", sha], dest);
}

// See MAX_FIRST_PARENT_COMMITS. A no-op when the repo's first-parent history
// from `sha` is already shorter than the bound.
async function boundHistory(dest: string, sha: string): Promise<void> {
  const log = await git(
    ["log", "--first-parent", "--format=%H", "-n", String(MAX_FIRST_PARENT_COMMITS), sha],
    dest,
  );
  const commits = log.split("\n").filter((line) => line.length > 0);
  if (commits.length < MAX_FIRST_PARENT_COMMITS) return;
  const boundary = commits[commits.length - 1];
  if (boundary === undefined) return;
  await git(["replace", "--graft", boundary], dest);
}

function byKey(a: MinedRecallBucket, b: MinedRecallBucket): number {
  if (a.ruleId !== b.ruleId) return a.ruleId < b.ruleId ? -1 : 1;
  if (a.class !== b.class) return a.class < b.class ? -1 : 1;
  if (a.zone !== b.zone) return a.zone < b.zone ? -1 : 1;
  return 0;
}

function mergeBuckets(buckets: readonly MinedRecallBucket[]): MinedRecallBucket[] {
  const totals = new Map<
    string,
    { ruleId: string; class: MinedRecallBucket["class"]; zone: MinedRecallBucket["zone"]; labels: number; caught: number }
  >();
  for (const b of buckets) {
    const key = `${b.ruleId}${b.class}${b.zone}`;
    const existing = totals.get(key);
    if (existing) {
      existing.labels += b.labels;
      existing.caught += b.caught;
    } else {
      totals.set(key, { ruleId: b.ruleId, class: b.class, zone: b.zone, labels: b.labels, caught: b.caught });
    }
  }
  const merged = [...totals.values()].map((t) => ({
    ruleId: t.ruleId,
    class: t.class,
    zone: t.zone,
    labels: t.labels,
    caught: t.caught,
    recall: t.labels > 0 ? t.caught / t.labels : null,
    recallWilsonLB: t.labels > 0 ? wilsonLowerBound(t.caught, t.labels) : null,
    recallSource: "git-mined" as const,
  }));
  return merged.sort(byKey);
}

async function processEntry(entry: CorpusEntry, scratchRoot: string): Promise<MinedRecallBucket[]> {
  const dest = join(scratchRoot, entry.repo);

  try {
    await cloneAndPin(entry.url, entry.sha, dest);
  } catch (e) {
    process.stderr.write(
      `[mine-gold-recall] SKIP ${entry.repo}: clone/checkout failed -- ${String(e)}\n`,
    );
    return [];
  }

  try {
    await boundHistory(dest, entry.sha);
  } catch (e) {
    process.stderr.write(
      `[mine-gold-recall] WARN ${entry.repo}: history bound failed, continuing unbounded -- ${String(e)}\n`,
    );
  }

  let candidates;
  try {
    candidates = await walkTokenizationCommits(dest, entry.repo);
  } catch (e) {
    process.stderr.write(`[mine-gold-recall] SKIP ${entry.repo}: walk failed -- ${String(e)}\n`);
    return [];
  }

  const resolveTokenValue = makeResolveTokenValue(dest, entry.repo);
  const labels: GoldLabel[] = [];
  for (const candidate of candidates) {
    try {
      const label = await confirmCandidate(dest, candidate, resolveTokenValue);
      if (label !== null) labels.push(label);
    } catch (e) {
      process.stderr.write(
        `[mine-gold-recall] WARN ${entry.repo}@${candidate.commit.slice(0, 8)}: confirm failed, skipping candidate -- ${String(e)}\n`,
      );
    }
  }

  process.stderr.write(
    `[mine-gold-recall] ${entry.repo}: candidates=${candidates.length} confirmed=${labels.length}\n`,
  );
  if (labels.length === 0) return [];

  try {
    return await measureGoldRecall(dest, labels);
  } catch (e) {
    process.stderr.write(
      `[mine-gold-recall] SKIP ${entry.repo}: measureGoldRecall failed -- ${String(e)}\n`,
    );
    return [];
  }
}

async function main(): Promise<void> {
  const commit = arg("--commit", "unknown");
  // No `new Date()` default (mirrors scripts/measure-recall.ts): the
  // no-arg case must stay byte-identical across runs.
  const measuredAt = arg("--at", "1970-01-01T00:00:00.000Z");

  const entries = parseGoldCorpusYaml(readFileSync(CORPUS_PATH, "utf8"));
  const scratchRoot = mkdtempSync(join(tmpdir(), "lyse-gold-mining-"));

  const allBuckets: MinedRecallBucket[] = [];
  try {
    for (const entry of entries) {
      const buckets = await processEntry(entry, scratchRoot);
      allBuckets.push(...buckets);
    }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }

  const merged = mergeBuckets(allBuckets);

  const ledger: MinedRecallLedger = {
    schemaVersion: 1,
    recallGeneratedFrom: {
      source: "git-mined (scripts/gold-corpus/color.yaml)",
      commit,
      measuredAt,
    },
    buckets: merged,
  };

  writeFileSync(OUT_PATH, JSON.stringify(ledger, null, 2) + "\n", "utf8");

  process.stderr.write(`\n[mine-gold-recall] buckets=${merged.length}\n`);
  for (const b of merged) {
    const recall = b.recall !== null ? (b.recall * 100).toFixed(1) + "%" : "—";
    const lb = b.recallWilsonLB !== null ? b.recallWilsonLB.toFixed(3) : "—";
    process.stderr.write(
      `[mine-gold-recall]   ${b.ruleId} · ${b.class} · ${b.zone}: N=${b.labels} caught=${b.caught} recall=${recall} wilsonLB=${lb}\n`,
    );
  }
  process.stderr.write(`\n[mine-gold-recall] wrote ${OUT_PATH}\n`);
}

// Only run when executed directly (not when imported by tests)
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  });
}
