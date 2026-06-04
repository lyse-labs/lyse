import type { Finding } from "../types.js";
import { findingWeight } from "./weight.js";
import { CURRENT_SCORING_VERSION } from "./version-pin.js";

export interface ScoreInput {
  findings: Finding[];
  stableSubAxes: Set<string>;
  confidenceByAxis: Record<string, number>;
}

export interface ScoreOutput {
  score: number;
  version: "scoring-v1";
  findingsCountedInScore: number;
  findingsReportedOnly: number;
}

export function computeScoreV1(input: ScoreInput): ScoreOutput {
  let penalty = 0;
  let counted = 0;
  let reportedOnly = 0;
  for (const f of input.findings) {
    if (!input.stableSubAxes.has(f.subAxisId)) {
      reportedOnly++;
      continue;
    }
    const conf = input.confidenceByAxis[f.subAxisId] ?? 0;
    penalty += findingWeight(f.severity, conf);
    counted++;
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 1.5)));
  return { score, version: CURRENT_SCORING_VERSION, findingsCountedInScore: counted, findingsReportedOnly: reportedOnly };
}
