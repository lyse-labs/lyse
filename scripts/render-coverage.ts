#!/usr/bin/env tsx
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SUB_AXES } from "../packages/core/src/reliability/catalogue/sub-axes.js";
import type { SubAxisRecord } from "../packages/core/src/reliability/types.js";

const root = resolve(import.meta.dirname, "..");
// SOURCE_DATE_EPOCH (https://reproducible-builds.org) overrides the embedded
// timestamp so re-running the script doesn't dirty the working tree on every
// invocation. Default: an opaque "deterministic" placeholder; release scripts
// can set the env var to stamp a real date.
const generatedAt = process.env["SOURCE_DATE_EPOCH"]
  ? new Date(Number(process.env["SOURCE_DATE_EPOCH"]) * 1000).toISOString()
  : "deterministic (set SOURCE_DATE_EPOCH=$(date +%s) for a stamped value)";

function fmtBound(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(3);
}

function fmtDate(value: string | null): string {
  if (value === null) return "—";
  return value.slice(0, 10);
}

function renderSubAxes(rows: readonly SubAxisRecord[]): string {
  const header = [
    "| ID | Axis | Name | Status | Precision (LB) | Recall (LB) | In Score |",
    "|---|---|---|---|---|---|---|",
  ];
  const body = rows.map((s) => {
    const inScore = s.contributesToScore ? "✅" : "—";
    return `| \`${s.id}\` | \`${s.axis}\` | ${s.name} | **${s.status}** | ${fmtBound(s.precisionWilsonLowerBound)} | ${fmtBound(s.recallWilsonLowerBound)} | ${inScore} |`;
  });
  return [...header, ...body].join("\n");
}

export function renderSloRow(s: SubAxisRecord): string {
  const ruleColumn = s.ruleIds.length === 0
    ? "_(LLM-driven, no static rule)_"
    : s.ruleIds.map((id) => `\`${id}\``).join(", ");
  return `| ${ruleColumn} | \`${s.id}\` | ${fmtBound(s.precisionWilsonLowerBound)} | ${fmtBound(s.recallWilsonLowerBound)} | ${s.nSamples ?? 0} | ${fmtDate(s.lastCalibrated)} |`;
}

function renderPerRuleSlo(rows: readonly SubAxisRecord[]): string {
  const stable = rows.filter((s) => s.status === "stable");
  const header = [
    "| Rule | Sub-axis | Precision (Wilson LB) | Recall (Wilson LB) | N samples | Last calibrated |",
    "|---|---|---|---|---|---|",
  ];
  if (stable.length === 0) {
    return [
      ...header,
      "| _none yet_ | _no sub-axis is in `stable` status at this time_ | — | — | — | — |",
    ].join("\n");
  }
  return [...header, ...stable.map(renderSloRow)].join("\n");
}

function header(title: string): string {
  return [
    `# Lyse — ${title}`,
    "",
    "> Auto-generated from `packages/core/src/reliability/catalogue/sub-axes.ts` by `scripts/render-coverage.ts`. Do not edit by hand — re-run the script.",
    "",
    `> Generated: ${generatedAt}`,
    "",
  ].join("\n");
}

function statusSummary(rows: readonly SubAxisRecord[]): string {
  const counts = { stable: 0, experimental: 0, disabled: 0 };
  for (const s of rows) counts[s.status] += 1;
  return [
    `**${rows.length} sub-axes total** — stable: ${counts.stable} · experimental: ${counts.experimental} · disabled: ${counts.disabled}`,
    "",
    "Only sub-axes with `status: stable` contribute to the Health Score by default. Promotion gate (dual): N ≥ 40 independently-provenanced samples AND Wilson 95 % lower bound ≥ 0.90 on both recall (ships the `stable` claim) and precision (contributes to the Health Score). See [`docs/architecture/reliability.md`](./reliability.md) for methodology.",
    "",
  ].join("\n");
}

const AXIS_ORDER: Record<string, number> = {
  tokens: 1, a11y: 2, components: 3, stories: 4, "ai-surface": 5, "ai-governance": 6,
};

const sortedSubAxes = [...SUB_AXES].sort((a, b) => {
  const ai = AXIS_ORDER[a.axis] ?? 99;
  const bi = AXIS_ORDER[b.axis] ?? 99;
  if (ai !== bi) return ai - bi;
  return a.id.localeCompare(b.id);
});

const subAxesMd = [
  header("Sub-axes coverage"),
  statusSummary(sortedSubAxes),
  "> **Precision / Recall (LB) column note:** Lower bounds are Wilson 95 % estimates. Most rows were calibrated against the fixed-N synthetic recall suite; only `tokens/no-hardcoded-color`, `tokens/no-hardcoded-shadow`, and `components/contracts-strictness` have an in-repo adversarial N (see the [Per-rule SLO](./per-rule-slo.md) page for N values).",
  "",
  renderSubAxes(sortedSubAxes),
  "",
].join("\n");

const perRuleSloMd = [
  header("Per-rule SLO"),
  "This page lists every sub-axis currently promoted to `stable`, with precision / recall Wilson 95 % lower bounds and the in-repo sample count (N).",
  "",
  "> **N = 0 rows:** Most sub-axes carry Wilson lower bounds retained from the prior fixed-N synthetic recall suite (run against `lyse-bench`). An `N` of 0 means no in-repo adversarial fixture has been exercised for that sub-axis yet; per-rule in-repo sample-count backfill is pending (deferred Task 11). Only rows with `N > 0` — currently `tokens/no-hardcoded-color`, `tokens/no-hardcoded-shadow`, and `components/contracts-strictness` — have an in-repo-derived sample count.",
  "",
  "An empty table means no sub-axis has crossed the promotion gate yet. The reliability system seeds the catalogue dormant; sub-axes earn `stable` status by clearing the gate against real labeled data.",
  "",
  renderPerRuleSlo(sortedSubAxes),
  "",
].join("\n");

await writeFile(resolve(root, "docs/architecture/sub-axes.md"), subAxesMd, "utf8");
await writeFile(resolve(root, "docs/architecture/per-rule-slo.md"), perRuleSloMd, "utf8");

console.log(`wrote docs/architecture/sub-axes.md (${sortedSubAxes.length} sub-axes)`);
console.log(`wrote docs/architecture/per-rule-slo.md (${sortedSubAxes.filter((s) => s.status === "stable").length} stable rules)`);
