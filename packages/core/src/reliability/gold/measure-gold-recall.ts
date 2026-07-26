import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditDirectory } from "../../commands/audit-pipeline.js";
import { wilsonLowerBound } from "../catalogue/promotion.js";
import { colorEquals } from "./color-eq.js";
import { git } from "./git.js";
import type { Finding } from "../../types.js";
import type { GoldLabel, MinedRecallBucket } from "./types.js";

// Any non-empty value that is not this fixture's own path is enough: setting
// `designSystem.componentsModule` explicitly keeps `dsSelfMode` false in
// `audit-pipeline.ts`, which is what zones consumer code "app" instead of
// "ds-source" — the value itself is never resolved against a real package.
// Mirrors `RECALL_FIXTURES`' `APP_ZONED_LYSE_YAML` (reliability/recall/fixtures.ts).
const APP_ZONED_LYSE_YAML = 'designSystem:\n  componentsModule: "@lyse-gold/app-zoning"\n';

const GROUP_DELIM = String.fromCharCode(31);

/** The finding's drifted colour — `anchor.ts#anchorKey().bucket`'s source field. */
function driftedLiteralOf(finding: Finding): string {
  return finding.fixGroup?.from ?? "";
}

// Join on file + normalized colour value, NOT on line number — intentionally.
// `label.line` is the ADDED ref's line in the CHILD (tokenization) commit, but
// this measurement audits the PARENT tree, where the removed literal sits at a
// different old-file line whenever the hunk shifted lines (e.g. the primer
// fixture: label.line 42 vs its parent line 43). Matching `f.location.line` to
// `label.line` would therefore silently miss line-shifted labels. This mirrors
// `diff/anchor.ts#anchorKey` (file + rule + normalized literal, the reformat-
// proof content identity). Do NOT "tighten" this to also compare line numbers.
function isCaught(findings: readonly Finding[], label: GoldLabel): boolean {
  return findings.some(
    (f) =>
      f.ruleId === label.ruleId &&
      f.location.file === label.file &&
      colorEquals(driftedLiteralOf(f), label.literal),
  );
}

/**
 * Captures whatever HEAD currently points at — a branch name when on one,
 * else the raw SHA (detached HEAD) — so the repo can be restored to exactly
 * the state it was found in, regardless of how many distinct parent commits
 * are visited in between.
 */
async function currentRef(repoDir: string): Promise<string> {
  try {
    const branch = await git(["symbolic-ref", "--short", "-q", "HEAD"], repoDir);
    if (branch.length > 0) return branch;
  } catch {
    // Detached HEAD: symbolic-ref fails — fall through to the SHA form.
  }
  return git(["rev-parse", "HEAD"], repoDir);
}

/**
 * Writes `.lyse.yaml` only when the checked-out tree has no config of its
 * own, so a repo that already zones itself correctly is left untouched.
 * Returns whether this call wrote the file (so the caller knows to remove
 * it again before moving on).
 */
function ensureAppZoned(repoDir: string): boolean {
  if (existsSync(join(repoDir, ".lyse.yaml")) || existsSync(join(repoDir, ".lyse.yml"))) return false;
  writeFileSync(join(repoDir, ".lyse.yaml"), APP_ZONED_LYSE_YAML, "utf8");
  return true;
}

function groupByParent(labels: readonly GoldLabel[]): Map<string, GoldLabel[]> {
  const groups = new Map<string, GoldLabel[]>();
  for (const label of labels) {
    const group = groups.get(label.parent);
    if (group) group.push(label);
    else groups.set(label.parent, [label]);
  }
  return groups;
}

export async function measureGoldRecall(
  repoDir: string,
  labels: GoldLabel[],
): Promise<MinedRecallBucket[]> {
  if (labels.length === 0) return [];

  const originalRef = await currentRef(repoDir);
  const outcomes: { label: GoldLabel; caught: boolean }[] = [];

  try {
    for (const [parent, group] of groupByParent(labels)) {
      await git(["checkout", "-q", parent], repoDir);
      const wroteConfig = ensureAppZoned(repoDir);
      try {
        const pipeline = await auditDirectory(repoDir, { staticOnly: true });
        for (const label of group) {
          outcomes.push({ label, caught: isCaught(pipeline.result.findings, label) });
        }
      } finally {
        if (wroteConfig) {
          const configPath = join(repoDir, ".lyse.yaml");
          if (existsSync(configPath)) unlinkSync(configPath);
        }
      }
    }
  } finally {
    await git(["checkout", "-q", originalRef], repoDir);
  }

  const buckets = new Map<string, MinedRecallBucket>();
  for (const { label, caught } of outcomes) {
    const key = `${label.ruleId}${GROUP_DELIM}exact${GROUP_DELIM}app`;
    const existing = buckets.get(key);
    if (existing) {
      existing.labels += 1;
      if (caught) existing.caught += 1;
    } else {
      buckets.set(key, {
        ruleId: label.ruleId,
        class: "exact",
        zone: "app",
        labels: 1,
        caught: caught ? 1 : 0,
        recall: null,
        recallWilsonLB: null,
        recallSource: "git-mined",
      });
    }
  }

  const result = [...buckets.values()].map((b) => ({
    ...b,
    recall: b.labels > 0 ? b.caught / b.labels : null,
    recallWilsonLB: wilsonLowerBound(b.caught, b.labels),
  }));

  result.sort((a, b) =>
    a.ruleId !== b.ruleId
      ? a.ruleId < b.ruleId ? -1 : 1
      : a.class !== b.class
        ? a.class < b.class ? -1 : 1
        : a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0,
  );

  return result;
}
