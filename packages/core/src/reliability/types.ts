import type { LlmJudgement } from "../types.js";

export type ScoringVersion = `scoring-v${number}`;

export type SubAxisStatus = "stable" | "experimental" | "disabled";

export type SubAxisId = string;

export type AxisLabel =
  | "tokens"
  | "a11y"
  | "components"
  | "stories"
  | "ai-surface"
  | "ai-governance";

export interface SubAxisRecord {
  id: SubAxisId;
  axis: AxisLabel;
  name: string;
  status: SubAxisStatus;
  precisionMeasured: number | null;
  recallMeasured: number | null;
  precisionWilsonLowerBound: number | null;
  recallWilsonLowerBound: number | null;
  lastCalibrated: string | null;
  contributesToScore: boolean;
  ruleIds: string[];
  llmDriven: boolean;
  // Deterministic validators (file-presence / JSON-schema / grammar rules) may
  // calibrate precision from the synthetic recall suite because their verdict is
  // structural, not context-dependent.
  deterministicValidator?: boolean;
  /**
   * Counts toward the trusted score ONLY when the LLM precision filter ran for
   * this audit (meta.layer4.filterRan === true). For heuristic rules whose
   * static precision is below the promotion gate but whose under-filter precision
   * has been calibrated to LB ≥ 0.90. Inert when the filter did not run.
   */
  contributesToScoreWhenFiltered?: boolean;
}

export interface ConfidenceManifest {
  version: ScoringVersion;
  generatedAt: string;
  validFrom: string;
  validUntil: string;
  subAxes: Record<SubAxisId, { precision: number; recall: number; nSamples: number }>;
}

export interface Finding {
  ruleId: string;
  subAxisId: SubAxisId;
  severity: "error" | "warning" | "info";
  confidence: "high" | "medium" | "low";
  message: string;
  file: string;
  line: number | null;
  column: number | null;
  /** LLM precision-filter / grader judgement, used by the conformal scoring gate (Phase D). */
  llmJudgement?: LlmJudgement;
}
