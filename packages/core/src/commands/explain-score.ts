import { resolve } from "node:path";
import { auditDirectory } from "./audit-pipeline.js";
import { SUB_AXES } from "../reliability/catalogue/sub-axes.js";
import { findingWeight } from "../reliability/score/weight.js";
import { BUNDLED_MANIFEST } from "../reliability/confidence/bundled-manifest.js";
import { resolveStableSubAxes } from "../reliability/score/stable-sub-axes.js";
import { computeGovernanceMaturityLevel, MATURITY_LABELS } from "../reliability/governance-maturity.js";
import type { GovernanceSignals } from "../reliability/governance-maturity.js";
import { generateGapReport } from "../reliability/gap-report.js";
import type { GapReport } from "../reliability/gap-report.js";
import { extractGovernanceSignals, gatherAiContext } from "../reliability/governance-signals.js";
import { scanForMarkerComponents } from "../rules/ai-governance-ai-marker-component-present.js";
import { aiGovernanceGraceFactor, DEFAULT_AI_GOVERNANCE_GRACE_WINDOW } from "../reliability/score/grace.js";
import { judgeGovernanceMaturity } from "../llm/governance-maturity-judge.js";
import { resolveConnector } from "../llm/connectors/resolver.js";
import { loadConfig } from "../config/schema.js";
import type { Finding as ReliabilityFinding } from "../reliability/types.js";
import type { Finding as LegacyFinding, AxisScore } from "../types.js";

function maturityDetail(s: GovernanceSignals): string {
  const present: string[] = [];
  if (s.hasReservedAiTokens) present.push("AI tokens");
  if (s.hasMarkerComponent) present.push("marker component");
  if (s.hasInteractionAffordance) present.push("interaction affordances");
  if (s.hasGovernanceAffordance) present.push("governance affordances");
  return present.length > 0 ? ` (${present.join(", ")})` : "";
}

export interface ExplainScoreOpts {
  cwd: string;
  staticOnly?: boolean;
  /** Injected for tests — defaults to the resolved connector. */
  maturityConnector?: import("../llm/connectors/types.js").ConnectorClient;
  maturityTimeoutMs?: number;
}

const MATURITY_CONF_THRESHOLD = 0.7;

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
  /** The audit's `finalScore` (H4: byte-identical to `lyse audit`'s Health Score). */
  score: number | "N/A";
  version: string;
  countedTotal: number;
  reportedOnlyTotal: number;
  buckets: AxisBucket[];
  rawText: string;
  maturityLevel?: number;
  gapReport: GapReport;
}

export interface FormatExplainScoreArgs {
  findings: ReliabilityFinding[];
  stableSubAxes: Set<string>;
  confidenceByAxis: Record<string, number>;
  /** The audit's `finalScore` — the single source of truth for the headline number (H4). */
  finalScore: number | "N/A";
  /** The audit's `scoringVersion` — reported alongside `finalScore`, not a locally-pinned value. */
  scoringVersion: string;
  /** Per-axis adoption breakdown from the audit result, rendered as ratio sentences. */
  axes: AxisScore[];
  /** Early-adopter grace factor for ai-governance findings (#89 / ADR-0018). Default 1 = inert. */
  aiGovernanceGrace?: number;
  /** AI-Governance Maturity Level (Track #72/#155) — reported alongside the score. */
  maturity?: { level: number; signals: GovernanceSignals; llmDerived?: boolean };
}

export function formatExplainScore(args: FormatExplainScoreArgs): ExplainScoreResult {
  const { findings, stableSubAxes, confidenceByAxis, finalScore, scoringVersion, axes } = args;
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

  const countedTotal = buckets.reduce((sum, b) => sum + b.countedFindings, 0);
  const reportedOnlyTotal = buckets.reduce((sum, b) => sum + b.reportedOnlyFindings, 0);

  const lines: string[] = [];
  lines.push("");
  const scoreText = finalScore === "N/A" ? "N/A" : `${finalScore} / 100`;
  lines.push(`  Health Score: ${scoreText}  ·  ${scoringVersion}`);
  lines.push(`  Counted findings: ${countedTotal}  ·  experimental (reported only): ${reportedOnlyTotal}`);
  if (args.maturity) {
    const m = args.maturity;
    const label = MATURITY_LABELS[m.level] ?? "unknown";
    const tier = m.llmDerived ? "  ·  LLM-derived" : "";
    lines.push(`  AI-Governance Maturity: L${m.level} — ${label}${maturityDetail(m.signals)}${tier}`);
  }
  lines.push("");
  lines.push("  Adoption by axis:");
  for (const a of axes) {
    if (typeof a.score === "number") {
      const clean = Math.max(0, a.opportunities - a.findings);
      lines.push(`    • ${a.axis}: ${a.score}% adoption (${clean}/${a.opportunities} usages)`);
    } else if (a.opportunities > 0) {
      lines.push(`    • ${a.axis}: insufficient sample (n=${a.opportunities}) — not scored`);
    } else {
      lines.push(`    • ${a.axis}: not scored — no ${a.axis} opportunities in scope`);
    }
  }
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

  const gapReport = generateGapReport(buckets, args.maturity);

  lines.push("  How to improve:");
  if (gapReport.scoreGaps.length === 0) {
    lines.push("    • Score: no counted findings — nothing to recover from the trusted score.");
  } else {
    lines.push("    • Score — fix these counted sub-axes first (most points back):");
    for (const g of gapReport.scoreGaps) {
      lines.push(`        ${g.subAxisId}: ${g.findings} findings → ~+${g.pointsRecoverable} pts`);
    }
  }
  if (gapReport.maturityGap) {
    const mg = gapReport.maturityGap;
    if (mg.nextLevel === null) {
      lines.push(`    • Maturity: at L${mg.currentLevel} (${mg.currentLabel}) — the statically-detectable ceiling.`);
    } else {
      lines.push(`    • Maturity: L${mg.currentLevel} → L${mg.nextLevel} (${mg.nextLabel}) needs ${mg.missing.join("; ")}`);
    }
  }
  lines.push("    (Kavcic maturity is one lens; HAX / PAIR remain the ground-truth anchors.)");
  lines.push("");

  return {
    // H4: the headline number IS the audit's finalScore — byte-identical to
    // `lyse audit`, not a separately-computed preview formula.
    score: finalScore,
    version: scoringVersion,
    countedTotal,
    reportedOnlyTotal,
    buckets,
    rawText: lines.join("\n"),
    gapReport,
    ...(args.maturity ? { maturityLevel: args.maturity.level } : {}),
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

  const filterRan = pipeline.result.meta?.layer4?.filterRan === true;
  const stableSubAxes = resolveStableSubAxes(SUB_AXES, { filterRan });
  const confidenceByAxis: Record<string, number> = {};
  for (const sa of SUB_AXES) {
    const manifestEntry = BUNDLED_MANIFEST.subAxes[sa.id];
    if (manifestEntry) confidenceByAxis[sa.id] = manifestEntry.precision;
    else if (sa.precisionWilsonLowerBound !== null) confidenceByAxis[sa.id] = sa.precisionWilsonLowerBound;
    else confidenceByAxis[sa.id] = 1.0;
  }

  // AI-Governance Maturity Level. Deterministic (L0–L3) by default — byte-stable.
  // The semantic LLM tier runs only on the non-static path (like the precision
  // filter): it can ADD evidence-grounded signals the deterministic pass missed,
  // gated by the conformal confidence threshold. Lyse's mapping always computes
  // the level (the judge supplies signals, not a level).
  let signals = extractGovernanceSignals(repoRoot);
  let llmDerived = false;
  if (opts.staticOnly !== true) {
    const aiContext = gatherAiContext(repoRoot);
    if (aiContext.trim() !== "") {
      const connector =
        opts.maturityConnector ?? resolveConnector(loadConfig(repoRoot, { onError: "degrade" }), undefined);
      const j = await judgeGovernanceMaturity(
        { repoName: repoRoot.split("/").pop() ?? repoRoot, aiContext },
        connector,
        opts.maturityTimeoutMs !== undefined ? { timeoutMs: opts.maturityTimeoutMs } : {},
      );
      if (j !== null && j.confidence >= MATURITY_CONF_THRESHOLD) {
        const merged: GovernanceSignals = {
          hasReservedAiTokens: signals.hasReservedAiTokens || j.signals.hasReservedAiTokens,
          hasMarkerComponent: signals.hasMarkerComponent || j.signals.hasMarkerComponent,
          hasInteractionAffordance: signals.hasInteractionAffordance || j.signals.hasInteractionAffordance,
          hasGovernanceAffordance: signals.hasGovernanceAffordance || j.signals.hasGovernanceAffordance,
        };
        // Only mark llmDerived when the judge actually changed the picture.
        if (JSON.stringify(merged) !== JSON.stringify(signals)) {
          signals = merged;
          llmDerived = true;
        }
      }
    }
  }
  const maturity = { level: computeGovernanceMaturityLevel(signals), signals, llmDerived };

  // Early-adopter grace (#89 / ADR-0018) — ramp ai-governance in by AI-surface maturity.
  const cfg = loadConfig(repoRoot, { onError: "degrade" });
  const graceWindow = cfg.scoring?.aiGovernanceGraceWindow ?? DEFAULT_AI_GOVERNANCE_GRACE_WINDOW;
  const aiGovernanceGrace = aiGovernanceGraceFactor(scanForMarkerComponents(repoRoot).length, graceWindow);

  return formatExplainScore({
    findings,
    stableSubAxes,
    confidenceByAxis,
    finalScore: pipeline.result.finalScore,
    scoringVersion: pipeline.result.scoringVersion,
    axes: pipeline.result.axes,
    maturity,
    aiGovernanceGrace,
  });
}

export async function runExplainScore(opts: ExplainScoreOpts): Promise<void> {
  const result = await explainScore(opts);
  process.stdout.write(result.rawText + "\n");
}
