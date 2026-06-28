import type { Confidence } from "../../types.js";

export type { Confidence };

export interface FindingRow {
  ruleId: string;
  repo: string;
  file: string;
  line: number;
  snippet: string;
  fileType: string;
  confidence: Confidence;
}
