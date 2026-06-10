import type { DimensionKappaResult } from "../reliability/llm-eval/kappa.js";
import { aggregateKappaByDimension } from "../reliability/llm-eval/kappa.js";
import type { KappaPair } from "../reliability/llm-eval/kappa-fixtures.js";

export interface KappaReport {
  schemaVersion: "kappa/1.0";
  generatedAt: string;
  dimensions: DimensionKappaResult[];
}

export function buildKappaReport(
  pairs: KappaPair[],
  opts?: { generatedAt?: string },
): KappaReport {
  return {
    schemaVersion: "kappa/1.0",
    generatedAt: opts?.generatedAt ?? new Date().toISOString(),
    dimensions: aggregateKappaByDimension(pairs),
  };
}
