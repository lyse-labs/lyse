import { MATURITY_LABELS } from "./governance-maturity.js";
import type { GovernanceSignals } from "./governance-maturity.js";

// scoring-v1 maps total penalty → score as `100 - penalty × 1.5` (see
// reliability/score/formula-v1.ts). Recovering a sub-axis's penalty therefore
// returns ~1.5× that penalty in points (before clamping). Kept in sync with the
// pinned formula; bumping the formula is a scoring-major event.
const PENALTY_TO_SCORE = 1.5;

/** The highest level the deterministic ladder can detect (L5 needs runtime). */
const MAX_DETECTABLE_LEVEL = 4;

interface ScoreGapItem {
  subAxisId: string;
  name: string;
  findings: number;
  penalty: number;
  /** Approximate Health-Score points recovered if this sub-axis is cleared. */
  pointsRecoverable: number;
}

interface MaturityGap {
  currentLevel: number;
  currentLabel: string;
  /** Next rung, or null when at the detectable cap (L4). */
  nextLevel: number | null;
  nextLabel: string | null;
  /** Concrete signals/rules to add to reach `nextLevel`. Empty when capped. */
  missing: string[];
}

export interface GapReport {
  scoreGaps: ScoreGapItem[];
  maturityGap: MaturityGap | null;
}

interface BucketLike {
  subAxisId: string;
  name: string;
  status: string;
  countedFindings: number;
  penalty: number;
}

// What unlocks the next rung, keyed by current level. Derived from the gate
// order in computeGovernanceMaturityLevel.
const NEXT_RUNG_REQUIREMENT: Record<number, string> = {
  0: "reserved AI-marker design tokens",
  1: "a dedicated AI-marker component (ai-governance/ai-marker-component-present)",
  2: "an AI interaction affordance — loading/error states, feedback control, or a live region (ai-governance/ai-loading-error-states · feedback-control-present · ai-content-live-region)",
  3: "AI governance affordances (a disclaimer, human-control, or explainability surface)",
};

function buildMaturityGap(level: number): MaturityGap {
  const currentLabel = MATURITY_LABELS[level] ?? "unknown";
  if (level >= MAX_DETECTABLE_LEVEL) {
    return { currentLevel: level, currentLabel, nextLevel: null, nextLabel: null, missing: [] };
  }
  const nextLevel = level + 1;
  const requirement = NEXT_RUNG_REQUIREMENT[level];
  return {
    currentLevel: level,
    currentLabel,
    nextLevel,
    nextLabel: MATURITY_LABELS[nextLevel] ?? "unknown",
    missing: requirement ? [requirement] : [],
  };
}

/**
 * Deterministic, actionable "how to improve" report. The score gap lists only
 * stable (counted) sub-axes — fixing them genuinely moves the Health Score —
 * ranked by penalty. The maturity gap names the concrete affordances needed to
 * climb the Kavcic ladder one rung. Kavcic is one lens; HAX/PAIR remain the
 * ground-truth anchors.
 */
export function generateGapReport(
  buckets: BucketLike[],
  maturity?: { level: number; signals: GovernanceSignals },
): GapReport {
  const scoreGaps: ScoreGapItem[] = buckets
    .filter((b) => b.status === "stable" && b.penalty > 0)
    .map((b) => ({
      subAxisId: b.subAxisId,
      name: b.name,
      findings: b.countedFindings,
      penalty: b.penalty,
      pointsRecoverable: Math.round(b.penalty * PENALTY_TO_SCORE),
    }))
    .sort((a, b) => (b.penalty !== a.penalty ? b.penalty - a.penalty : a.subAxisId.localeCompare(b.subAxisId)));

  return {
    scoreGaps,
    maturityGap: maturity ? buildMaturityGap(maturity.level) : null,
  };
}
