import type { Finding } from "../types.js";
import { findingWeight } from "./weight.js";
import { CURRENT_SCORING_VERSION } from "./version-pin.js";
import { AI_GOVERNANCE_PREFIX } from "./grace.js";

export interface ScoreInput {
  findings: Finding[];
  stableSubAxes: Set<string>;
  confidenceByAxis: Record<string, number>;
  /**
   * Conformal-gated sub-axes (Phase D): subAxisId → confidence threshold θ. A
   * finding in one of these counts toward the score only if its
   * `llmJudgement.confidence` is ≥ θ; otherwise it is reported-only. Omitting
   * the map (or an empty map) is inert — scoring is unchanged.
   */
  conformalSubAxes?: ReadonlyMap<string, number>;
  /**
   * Early-adopter grace factor in [0, 1] for ai-governance findings (#89 /
   * ADR-0018). A nascent AI surface should not take the full weight of
   * governance affordances it has not built yet. Each ai-governance finding's
   * score penalty is scaled by this factor; findings are still reported.
   * Omitting it (or 1) is inert. See `score/grace.ts`.
   */
  aiGovernanceGrace?: number;
}

export interface ScoreOutput {
  score: number;
  version: string;
  findingsCountedInScore: number;
  findingsReportedOnly: number;
}

export function computeScoreV1(input: ScoreInput): ScoreOutput {
  let penalty = 0;
  let counted = 0;
  let reportedOnly = 0;
  for (const f of input.findings) {
    let countsTowardScore = input.stableSubAxes.has(f.subAxisId);

    if (!countsTowardScore) {
      // Conformal gate: a graded sub-axis counts only when the finding's
      // confidence clears the calibrated threshold θ.
      const theta = input.conformalSubAxes?.get(f.subAxisId);
      const conf = f.llmJudgement?.confidence;
      if (theta !== undefined && typeof conf === "number" && conf >= theta) {
        countsTowardScore = true;
      }
    }

    if (!countsTowardScore) {
      reportedOnly++;
      continue;
    }
    const w = findingWeight(f.severity, input.confidenceByAxis[f.subAxisId] ?? 0);
    const grace = input.aiGovernanceGrace ?? 1;
    penalty += f.subAxisId.startsWith(AI_GOVERNANCE_PREFIX) ? w * grace : w;
    counted++;
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 1.5)));
  return { score, version: CURRENT_SCORING_VERSION, findingsCountedInScore: counted, findingsReportedOnly: reportedOnly };
}
