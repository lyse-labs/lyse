import type { Confidence } from "../../types.js";

export interface FindingRow {
  ruleId: string;
  repo: string;
  file: string;
  line: number;
  snippet: string;
  fileType: string;
  confidence: Confidence;
  /** Original finding message — required by row-aware verifiers (e.g. stories/props-documented). */
  message?: string;
}
