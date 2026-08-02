/**
 * The pure half of the ecosystem diff: turn one audit's JSON into the numbers a
 * reviewer actually reads, and describe what moved between two of them.
 *
 * Why a diff at all, when `bench-golden` already photographs four repos: a
 * committed snapshot is an artefact that goes stale, and whoever's PR turns it
 * red is the person who regenerates it. At four repos that is reviewable. At
 * twenty it is a rubber stamp, and regenerating-without-reading is the same
 * self-healing-oracle failure one level up. A main-vs-candidate diff has no
 * artefact to regenerate: the only way to make it empty is to not change
 * behaviour. That property is what makes it usable as an agent's oracle — an
 * agent cannot author the twenty repositories, and it cannot edit the baseline
 * it is compared against.
 *
 * Everything that changes run-to-run (timestamps, tool version, absolute paths)
 * is dropped here, so a diff means a behaviour change and nothing else.
 */

import { createHash } from "node:crypto";

export type Score = number | "N/A" | "(no result)";

export interface RepoSummary {
  repo: string;
  score: Score;
  axes: Record<string, { score: Score; findings: number; opportunities: number }>;
  findingsByRule: Record<string, number>;
  extraction: Record<string, string>;
  /**
   * The extractors' evidence numbers, not just their ok/degraded status.
   * Tracking only the status missed `tokenNodes 78 -> 79` on polaris and
   * `214 -> 222` on shadcn — real behaviour changes this report called
   * "unchanged" while the golden snapshots recorded them.
   */
  extractionEvidence: Record<string, number>;
  /**
   * A digest over finding identity (rule, file, line), so a finding that MOVES
   * or changes shape is visible even when the per-rule counts are identical.
   * polaris's findingsDigest changed with every rule count equal.
   */
  findingsDigest: string;
}

interface AuditIsh {
  finalScore?: unknown;
  score?: unknown;
  axes?: { axis?: unknown; score?: unknown; findings?: unknown; opportunities?: unknown }[];
  findings?: { ruleId?: unknown; location?: { file?: unknown; line?: unknown } }[];
  meta?: { extraction?: { entries?: { extractor?: unknown; status?: unknown; evidence?: Record<string, unknown> }[] } };
  extraction?: { entries?: { extractor?: unknown; status?: unknown; evidence?: Record<string, unknown> }[] };
}

const asScore = (v: unknown): Score =>
  typeof v === "number" ? v : v === "N/A" ? "N/A" : "(no result)";

export function summarize(repo: string, audit: unknown): RepoSummary {
  const a = (audit ?? {}) as AuditIsh;
  const axes: RepoSummary["axes"] = {};
  for (const ax of a.axes ?? []) {
    if (typeof ax.axis !== "string") continue;
    axes[ax.axis] = {
      score: asScore(ax.score),
      findings: typeof ax.findings === "number" ? ax.findings : 0,
      opportunities: typeof ax.opportunities === "number" ? ax.opportunities : 0,
    };
  }
  const findingsByRule: Record<string, number> = {};
  for (const f of a.findings ?? []) {
    if (typeof f.ruleId !== "string") continue;
    findingsByRule[f.ruleId] = (findingsByRule[f.ruleId] ?? 0) + 1;
  }
  const extraction: Record<string, string> = {};
  const extractionEvidence: Record<string, number> = {};
  for (const e of a.meta?.extraction?.entries ?? a.extraction?.entries ?? []) {
    if (typeof e.extractor !== "string" || typeof e.status !== "string") continue;
    extraction[e.extractor] = e.status;
    for (const [k, v] of Object.entries(e.evidence ?? {})) {
      if (typeof v === "number") extractionEvidence[`${e.extractor}.${k}`] = v;
    }
  }
  const identities = (a.findings ?? [])
    .map((f) => `${String(f.ruleId)}|${String(f.location?.file)}|${String(f.location?.line)}`)
    .sort();
  const findingsDigest = createHash("sha256").update(identities.join("\n")).digest("hex").slice(0, 12);
  return {
    repo, score: asScore(a.finalScore ?? a.score), axes, findingsByRule,
    extraction, extractionEvidence, findingsDigest,
  };
}

const keys = (...records: Record<string, unknown>[]): string[] =>
  [...new Set(records.flatMap((r) => Object.keys(r)))].sort();

/** One line per thing that moved, empty when the two runs agree. */
export function diffSummaries(before: RepoSummary, after: RepoSummary): string[] {
  const lines: string[] = [];

  if (before.score !== after.score) lines.push(`score ${before.score} -> ${after.score}`);

  for (const axis of keys(before.axes, after.axes)) {
    const b = before.axes[axis];
    const a = after.axes[axis];
    if (b === undefined || a === undefined) {
      lines.push(`axis ${axis} ${b === undefined ? "appeared" : "disappeared"}`);
      continue;
    }
    if (b.score !== a.score) lines.push(`axis ${axis} ${b.score} -> ${a.score}`);
    if (b.opportunities !== a.opportunities) {
      lines.push(`axis ${axis} opportunities ${b.opportunities} -> ${a.opportunities}`);
    }
  }

  for (const rule of keys(before.findingsByRule, after.findingsByRule)) {
    const b = before.findingsByRule[rule] ?? 0;
    const a = after.findingsByRule[rule] ?? 0;
    if (b !== a) lines.push(`rule ${rule} ${b} -> ${a}`);
  }

  for (const extractor of keys(before.extraction, after.extraction)) {
    const b = before.extraction[extractor] ?? "(absent)";
    const a = after.extraction[extractor] ?? "(absent)";
    if (b !== a) lines.push(`extraction ${extractor} ${b} -> ${a}`);
  }

  for (const key of keys(before.extractionEvidence, after.extractionEvidence)) {
    const b = before.extractionEvidence[key];
    const a = after.extractionEvidence[key];
    if (b !== a) lines.push(`evidence ${key} ${b ?? "(absent)"} -> ${a ?? "(absent)"}`);
  }

  if (before.findingsDigest !== after.findingsDigest) {
    lines.push(
      `finding identities changed (digest ${before.findingsDigest} -> ${after.findingsDigest})` +
        (lines.length === 0 ? " — with every count equal, so something moved or was reworded" : ""),
    );
  }

  return lines;
}

export interface RepoDiff {
  repo: string;
  lines: string[];
  /** Set when the repo could not be compared — not the same as "did not move". */
  failed?: string;
}

export function renderReport(diffs: readonly RepoDiff[], baselineRef = "origin/main"): string {
  const failed = diffs.filter((d) => d.failed !== undefined);
  const compared = diffs.filter((d) => d.failed === undefined);
  const moved = compared.filter((d) => d.lines.length > 0);

  const out: string[] = [`## Ecosystem diff — \`${baselineRef}\` vs this branch`, ""];

  if (failed.length > 0) {
    // A repo that could not be compared is not a repo that agreed. Reporting
    // only the changes would make a run where everything crashed look clean.
    out.push(`**${failed.length} could not be compared:**`);
    for (const d of failed) out.push(`- \`${d.repo}\` — ${d.failed}`);
    out.push("");
  }

  if (compared.length === 0) {
    out.push("No repository was compared. Treat this run as having checked nothing.");
    return out.join("\n");
  }

  if (moved.length === 0) {
    const plural = compared.length === 1 ? "repository" : `${compared.length} repositories`;
    out.push(`No behavioural change on ${compared.length === 1 ? "the one" : "any of the"} ${plural} compared.`);
    out.push("");
    out.push(`<sub>Compared: ${compared.map((d) => d.repo).join(", ")}</sub>`);
    return out.join("\n");
  }

  out.push(`Behaviour moved on **${moved.length} of ${compared.length}** repositories compared.`);
  out.push("");
  for (const d of moved) {
    out.push(`<details><summary><code>${d.repo}</code> — ${d.lines.length} change${d.lines.length === 1 ? "" : "s"}</summary>`);
    out.push("");
    out.push("```");
    for (const line of d.lines) out.push(line);
    out.push("```");
    out.push("</details>");
  }
  const still = compared.filter((d) => d.lines.length === 0).map((d) => d.repo);
  if (still.length > 0) {
    out.push("");
    out.push(`<sub>Unchanged: ${still.join(", ")}</sub>`);
  }
  return out.join("\n");
}
