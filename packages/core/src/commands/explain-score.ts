import { resolve } from "node:path";
import { auditDirectory } from "./audit-pipeline.js";
import { SUB_AXES } from "../reliability/catalogue/sub-axes.js";
import { computeScoreV1 } from "../reliability/score/formula-v1.js";
import { CURRENT_SCORING_VERSION } from "../reliability/score/version-pin.js";
import { findingWeight } from "../reliability/score/weight.js";
import { BUNDLED_MANIFEST } from "../reliability/confidence/bundled-manifest.js";
import type { Finding as ReliabilityFinding } from "../reliability/types.js";
import type { Finding as LegacyFinding } from "../types.js";

export interface ExplainScoreOpts {
  cwd: string;
  staticOnly?: boolean;
}

interface AxisBucket {
  subAxisId: string;
  name: string;
  status: "stable" | "experimental" | "disabled";
  countedFindings: number;
  reportedOnlyFindings: number;
  confidence: number;
  penalty: number;
}

const RULE_TO_SUB_AXIS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const sa of SUB_AXES) {
    for (const r of sa.ruleIds) m.set(r, sa.id);
  }
  return m;
})();

function subAxisForRule(ruleId: string): string {
  return RULE_TO_SUB_AXIS.get(ruleId) ?? "unmapped";
}

function legacyToReliability(f: LegacyFinding): ReliabilityFinding {
  const sev: string = f.severity;
  const severity = (sev === "warn" ? "warning" : sev) as ReliabilityFinding["severity"];
  return {
    ruleId: f.ruleId,
    subAxisId: subAxisForRule(f.ruleId),
    severity,
    confidence: f.confidence ?? "high",
    message: f.message,
    file: f.location.file,
    line: f.location.line,
    column: f.location.column,
  };
}

export interface ExplainScoreResult {
  score: number;
  version: string;
  countedTotal: number;
  reportedOnlyTotal: number;
  buckets: AxisBucket[];
  rawText: string;
}

export interface FormatExplainScoreArgs {
  findings: ReliabilityFinding[];
  stableSubAxes: Set<string>;
  confidenceByAxis: Record<string, number>;
}

export function formatExplainScore(args: FormatExplainScoreArgs): ExplainScoreResult {
  const { findings, stableSubAxes, confidenceByAxis } = args;
  const scoring = computeScoreV1({ findings, stableSubAxes, confidenceByAxis });
  const bucketsBySubAxis = new Map<string, AxisBucket>();
  for (const f of findings) {
    const sa = SUB_AXES.find((s) => s.id === f.subAxisId);
    const id = f.subAxisId;
    let b = bucketsBySubAxis.get(id);
    if (!b) {
      const conf = confidenceByAxis[id] ?? 0;
      b = {
        subAxisId: id,
        name: sa?.name ?? id,
        status: stableSubAxes.has(id) ? "stable" : sa?.status ?? "experimental",
        countedFindings: 0,
        reportedOnlyFindings: 0,
        confidence: conf,
        penalty: 0,
      };
      bucketsBySubAxis.set(id, b);
    }
    if (stableSubAxes.has(id)) {
      b.countedFindings += 1;
      b.penalty += findingWeight(f.severity, b.confidence);
    } else {
      b.reportedOnlyFindings += 1;
    }
  }

  const buckets = Array.from(bucketsBySubAxis.values()).sort((a, b) => {
    if (a.status === "stable" && b.status !== "stable") return -1;
    if (b.status === "stable" && a.status !== "stable") return 1;
    if (b.penalty !== a.penalty) return b.penalty - a.penalty;
    return a.subAxisId.localeCompare(b.subAxisId);
  });

  const lines: string[] = [];
  lines.push("");
  lines.push(`  Health Score: ${scoring.score} / 100  ·  ${CURRENT_SCORING_VERSION}`);
  lines.push(`  Counted findings: ${scoring.findingsCountedInScore}  ·  experimental (reported only): ${scoring.findingsReportedOnly}`);
  lines.push("");
  lines.push("  Formula:  score = clamp(100 - penalty × 1.5, 0, 100)");
  lines.push("            penalty per finding = severity_weight × axis_confidence");
  lines.push("            severity weights: error=4 · warning=2 · info=1");
  lines.push("");

  if (buckets.length === 0) {
    lines.push("  No findings — no penalties applied.");
    lines.push("");
  } else {
    const stableBuckets = buckets.filter((b) => b.status === "stable");
    const experimentalBuckets = buckets.filter((b) => b.status !== "stable");

    if (stableBuckets.length > 0) {
      lines.push("  Counted toward score (stable sub-axes):");
      for (const b of stableBuckets) {
        lines.push(
          `    • ${b.name}  (${b.subAxisId})`,
        );
        lines.push(
          `        ${b.countedFindings} findings × confidence ${b.confidence.toFixed(2)} → penalty ${b.penalty.toFixed(2)}`,
        );
      }
      lines.push("");
    }

    if (experimentalBuckets.length > 0) {
      lines.push("  Reported only (experimental sub-axes — not counted):");
      for (const b of experimentalBuckets) {
        lines.push(
          `    • ${b.name}  (${b.subAxisId})  — ${b.reportedOnlyFindings} findings`,
        );
      }
      lines.push("");
    }
  }

  return {
    score: scoring.score,
    version: scoring.version,
    countedTotal: scoring.findingsCountedInScore,
    reportedOnlyTotal: scoring.findingsReportedOnly,
    buckets,
    rawText: lines.join("\n"),
  };
}

/**
 * Compute the score breakdown for the current repo and return both the
 * structured data (for tests) and a Lighthouse-style text rendering (for stdout).
 */
export async function explainScore(opts: ExplainScoreOpts): Promise<ExplainScoreResult> {
  const repoRoot = resolve(opts.cwd);
  const pipeline = await auditDirectory(
    repoRoot,
    opts.staticOnly === true ? { staticOnly: true } : undefined,
  );
  const findings = pipeline.result.findings.map(legacyToReliability);

  const stableSubAxes = new Set(
    SUB_AXES.filter((s) => s.status === "stable" && s.contributesToScore).map((s) => s.id),
  );
  const confidenceByAxis: Record<string, number> = {};
  for (const sa of SUB_AXES) {
    const manifestEntry = BUNDLED_MANIFEST.subAxes[sa.id];
    if (manifestEntry) confidenceByAxis[sa.id] = manifestEntry.precision;
    else if (sa.precisionWilsonLowerBound !== null) confidenceByAxis[sa.id] = sa.precisionWilsonLowerBound;
    else confidenceByAxis[sa.id] = 1.0;
  }

  return formatExplainScore({ findings, stableSubAxes, confidenceByAxis });
}

export async function runExplainScore(opts: ExplainScoreOpts): Promise<void> {
  const result = await explainScore(opts);
  process.stdout.write(result.rawText + "\n");
}
