import type { LlmJudgement } from "../types.js";

export type ScoringVersion = `scoring-v${number}`;

/**
 * Canonical definition (also in packages/core/validation/types.ts).
 * Cannot re-export due to tsconfig rootDir constraint: validation/ is
 * excluded from src/, so importing from ../../validation/types violates
 * "rootDir": "./src". Duplication is verified as necessary (TS6059 error).
 */
export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

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
  /**
   * Counts toward the score-v2 PREVIEW channel (#71). The preview is a read-only,
   * strict superset of the trusted v1 set: deterministic structural sub-axes whose
   * synthetic recall AND precision Wilson lower bounds both clear the 0.90 gate but
   * which have not yet been promoted into the live (v1) trusted score. Never feeds
   * the trusted Health Score; surfaced by `explain --score` so the impact of
   * promoting them can be inspected before any v1 change.
   */
  contributesToScoreV2?: boolean;
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
