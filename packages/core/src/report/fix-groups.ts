import type { AxisName, Finding, ProjectionEntry, ProjectionMeta, Severity } from "../types.js";
import { scoreFromFindings, type ScoreOptions } from "../scorer.js";

export type { ProjectionEntry, ProjectionMeta } from "../types.js";

/**
 * Default distinct-file threshold above which a fix group is flagged
 * `migrationScale` (large blast radius — sample before you sweep).
 * Overridable via `.lyse.yaml` `advisory.migrationScaleFileCount`.
 */
export const MIGRATION_SCALE_FILE_COUNT_DEFAULT = 40;

/** One coherent fix: all findings sharing a `fixGroup.key` (or bare `ruleId` when ungrouped). */
export interface FindingGroup {
  /** `fixGroup.key` when present, else `ruleId`. */
  key: string;
  ruleId: string;
  /** `fixGroup.from` of the representative finding. */
  from?: string;
  /** `fixGroup.to` of the representative finding (single-candidate replacement). */
  to?: string;
  findings: Finding[];
  /** Distinct `location.file` count across the group's findings. */
  fileCount: number;
  /** True when `fileCount >= migrationScaleFileCount`. */
  migrationScale: boolean;
}

/** Ranks severities for sorting: error < warning < info. */
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Groups findings by their fix — `fixGroup.key` when present, else `ruleId`.
 * Sort is deterministic: group size (findings.length) descending, then
 * severity ascending (error < warning < info — a group's severity is its
 * `findings[0].severity`, uniform per group by construction), then key
 * ascending as the final tiebreaker.
 */
export function groupFindings(findings: Finding[], migrationScaleFileCount: number): FindingGroup[] {
  const byKey = new Map<string, FindingGroup>();

  for (const finding of findings) {
    const key = finding.fixGroup?.key ?? finding.ruleId;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        ruleId: finding.ruleId,
        ...(finding.fixGroup?.from !== undefined && { from: finding.fixGroup.from }),
        ...(finding.fixGroup?.to !== undefined && { to: finding.fixGroup.to }),
        findings: [],
        fileCount: 0,
        migrationScale: false,
      };
      byKey.set(key, group);
    }
    group.findings.push(finding);
  }

  const groups = [...byKey.values()];
  for (const group of groups) {
    const files = new Set(group.findings.map((f) => f.location.file));
    group.fileCount = files.size;
    group.migrationScale = files.size >= migrationScaleFileCount;
  }

  groups.sort(
    (a, b) =>
      b.findings.length - a.findings.length ||
      SEVERITY_RANK[a.findings[0]!.severity] - SEVERITY_RANK[b.findings[0]!.severity] ||
      a.key.localeCompare(b.key),
  );
  return groups;
}

function removeGroupFindings(allFindings: Finding[], toRemove: ReadonlySet<Finding>): Finding[] {
  return allFindings.filter((f) => !toRemove.has(f));
}

function projectedFinalScore(
  remaining: Finding[],
  opportunitiesByAxis: Record<AxisName, number>,
  scoreOpts: ScoreOptions,
  fallback: number,
): number {
  const result = scoreFromFindings(remaining, opportunitiesByAxis, scoreOpts);
  return result.finalScore === "N/A" ? fallback : result.finalScore;
}

/**
 * Computes a deterministic score projection for the largest fix groups.
 * Candidates are the top `cap * 2` groups by count (as ranked by
 * `groupFindings`); each candidate's gain is the Health Score delta from
 * removing its findings, floored at 0. Groups with zero gain are dropped.
 * `totalGainTop3` is a single additional scorer run with every kept
 * top-entry's findings removed at once — gains do not add linearly.
 *
 * Removal is by object identity (`Finding` has no unique id), so `groups`
 * must be derived from `allFindings` itself — e.g. `groupFindings(findings)`
 * followed by `computeProjection(groups, findings, ...)`. Passing a
 * deep-equal but distinct `Finding[]` (e.g. round-tripped through JSON)
 * silently yields zero gain for every candidate.
 *
 * Returns undefined when `finalScore` is `"N/A"` or no group has gain > 0.
 */
export function computeProjection(
  groups: FindingGroup[],
  allFindings: Finding[],
  opportunitiesByAxis: Record<AxisName, number>,
  scoreOpts: ScoreOptions,
  finalScore: number | "N/A",
  cap = 3,
): ProjectionMeta | undefined {
  if (finalScore === "N/A") return undefined;

  const baseline: number = finalScore;
  const candidates = groups.slice(0, cap * 2);

  const entries: ProjectionEntry[] = [];
  for (const group of candidates) {
    const toRemove = new Set(group.findings);
    const remaining = removeGroupFindings(allFindings, toRemove);
    const projected = projectedFinalScore(remaining, opportunitiesByAxis, scoreOpts, baseline);
    const gain = Math.max(0, projected - baseline);
    if (gain <= 0) continue;
    entries.push({
      key: group.key,
      ruleId: group.ruleId,
      ...(group.from !== undefined && { from: group.from }),
      ...(group.to !== undefined && { to: group.to }),
      count: group.findings.length,
      files: group.fileCount,
      gain,
      migrationScale: group.migrationScale,
    });
  }

  if (entries.length === 0) return undefined;

  entries.sort((a, b) => b.gain - a.gain || b.count - a.count || a.key.localeCompare(b.key));
  const top = entries.slice(0, cap);

  const topKeys = new Set(top.map((entry) => entry.key));
  const topGroups = groups.filter((group) => topKeys.has(group.key));
  const topRemoved = new Set(topGroups.flatMap((group) => group.findings));
  const remainingAfterTop = removeGroupFindings(allFindings, topRemoved);
  const afterTop = projectedFinalScore(remainingAfterTop, opportunitiesByAxis, scoreOpts, baseline);
  const totalGainTop3 = Math.max(0, afterTop - baseline);

  return { top, totalGainTop3 };
}
