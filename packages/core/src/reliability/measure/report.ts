import type { MeasureKind } from "./rule-measure-kind.js";

export interface RuleMeasurement {
  ruleId: string;
  kind: MeasureKind;
  nSamples: number;
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

  const lines: string[] = ["# Measurement report", ""];

  for (const verdict of VERDICT_ORDER) {
    const group = byVerdict.get(verdict)!;
    if (group.length === 0) continue;
    lines.push(`## ${verdict} (${group.length})`);
    lines.push("");
    lines.push("| ruleId | kind | n | precLB | recallSyn | labelSource |");
    lines.push("|--------|------|---|--------|-----------|-------------|");
    for (const m of group.sort((a, b) => a.ruleId.localeCompare(b.ruleId))) {
      const precLB = m.precisionWilsonLowerBound !== null ? m.precisionWilsonLowerBound.toFixed(3) : "—";
      const rec = m.recallSynthetic !== null ? m.recallSynthetic.toFixed(3) : "—";
      lines.push(`| ${m.ruleId} | ${m.kind} | ${m.nSamples} | ${precLB} | ${rec} | ${m.labelSource} |`);
    }
    lines.push("");
  }

  return { md: lines.join("\n"), json };
}
