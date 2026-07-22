import type { MeasureKind } from "./rule-measure-kind.js";
import type { LedgerBucket, RulePrecisionLedger } from "./bucket.js";

export interface RuleMeasurement {
  ruleId: string;
  kind: MeasureKind;
  nSamples: number;
  /** Total findings harvested before the detection sampling cap was applied.
   * Populated only for detection rules when a cap was applied (nTotal > nSamples).
   * Absent for structural/render-only rules. */
  nTotal?: number;
  precisionMeasured: number | null;
  precisionWilsonLowerBound: number | null;
  recallSynthetic: number | null;
  labelSource: "auto" | "llm-provisional" | "human-validated" | "none";
  verdict: "promotable" | "walled" | "pending-human" | "not-measured";
}

function assignVerdict(m: RuleMeasurement): RuleMeasurement["verdict"] {
  if (m.kind === "render-only" || m.nSamples === 0) return "not-measured";
  if (m.labelSource === "llm-provisional") return "pending-human";
  if (
    m.labelSource === "none" ||
    m.precisionWilsonLowerBound === null ||
    m.recallSynthetic === null
  ) {
    return "walled";
  }
  if (
    m.precisionWilsonLowerBound >= 0.9 &&
    m.recallSynthetic >= 0.9 &&
    (m.labelSource === "auto" || m.labelSource === "human-validated")
  ) {
    return "promotable";
  }
  return "walled";
}

const VERDICT_ORDER: RuleMeasurement["verdict"][] = [
  "promotable",
  "pending-human",
  "walled",
  "not-measured",
];

export function buildReport(perRule: RuleMeasurement[]): { md: string; json: RuleMeasurement[] } {
  const resolved: RuleMeasurement[] = perRule.map((m) => ({
    ...m,
    verdict: assignVerdict(m),
  }));

  const json = [...resolved].sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  const byVerdict = new Map<RuleMeasurement["verdict"], RuleMeasurement[]>();
  for (const v of VERDICT_ORDER) byVerdict.set(v, []);
  for (const m of resolved) {
    byVerdict.get(m.verdict)!.push(m);
  }

  // nSamples > 0 guard: in structural-only runs detection rules have nSamples 0
  // (not judged at all) — a cap was NOT applied, so they must not trigger the
  // "precision measured on a capped sample" banner (which would contradict the
  // partial-run header and overclaim that detection was measured).
  const cappedRules = resolved.filter(
    (m) => m.nTotal !== undefined && m.nTotal > m.nSamples && m.nSamples > 0,
  );

  const lines: string[] = ["# Measurement report", ""];

  if (cappedRules.length > 0) {
    lines.push(
      "> **Sampling cap applied**: detection precision was measured on a capped sample for " +
        `${cappedRules.length} rule(s). ` +
        "The `n` column shows findings judged; `nTotal` shows total harvested. " +
        "Precision estimates are based on the sampled subset only.",
    );
    lines.push("");
  }

  for (const verdict of VERDICT_ORDER) {
    const group = byVerdict.get(verdict)!;
    if (group.length === 0) continue;
    lines.push(`## ${verdict} (${group.length})`);
    lines.push("");
    lines.push("| ruleId | kind | n | nTotal | precLB | recallSyn | labelSource |");
    lines.push("|--------|------|---|--------|--------|-----------|-------------|");
    for (const m of group.sort((a, b) => a.ruleId.localeCompare(b.ruleId))) {
      const precLB = m.precisionWilsonLowerBound !== null ? m.precisionWilsonLowerBound.toFixed(3) : "—";
      const rec = m.recallSynthetic !== null ? m.recallSynthetic.toFixed(3) : "—";
      const nTotal = m.nTotal !== undefined ? String(m.nTotal) : "—";
      lines.push(`| ${m.ruleId} | ${m.kind} | ${m.nSamples} | ${nTotal} | ${precLB} | ${rec} | ${m.labelSource} |`);
    }
    lines.push("");
  }

  return { md: lines.join("\n"), json };
}

function renderBucketLine(b: LedgerBucket): string {
  const label = `${b.class} · ${b.zone}`;
  if (b.precision === null || b.n === 0) {
    return `- ${label}: not measured`;
  }
  const pct = (b.precision * 100).toFixed(1);
  if (b.labelSource === "auto") {
    const gate = b.gateEligible ? " · gate-eligible" : "";
    return `- ${label}: measured ${pct}% · N=${b.n} · deterministic${gate}`;
  }
  return `- ${label}: candidate estimate ~${pct}% · N=${b.n}`;
}

export function renderLedger(ledger: RulePrecisionLedger): string {
  if (ledger.buckets.length === 0) return "";
  const byRule = new Map<string, LedgerBucket[]>();
  for (const b of ledger.buckets) {
    const list = byRule.get(b.ruleId);
    if (list) list.push(b);
    else byRule.set(b.ruleId, [b]);
  }
  const lines: string[] = ["## Per-class precision (rules-precision ledger)", ""];
  for (const [ruleId, buckets] of byRule) {
    lines.push(`### ${ruleId}`);
    for (const b of buckets) lines.push(renderBucketLine(b));
    lines.push("");
  }
  return lines.join("\n");
}
