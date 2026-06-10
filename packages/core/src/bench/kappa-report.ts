import type { DimensionKappaResult } from "../reliability/llm-eval/kappa.js";
import { aggregateKappaByDimension } from "../reliability/llm-eval/kappa.js";
import type { KappaPair } from "../reliability/llm-eval/kappa-fixtures.js";
import type { DivergenceDiagnostic } from "../reliability/llm-eval/divergence.js";
import { detectDivergence } from "../reliability/llm-eval/divergence.js";

export interface KappaReport {
  schemaVersion: "kappa/2.0";
  generatedAt: string;
  dimensions: DimensionKappaResult[];
  /** Diagnostics for rules whose kappa falls below DIVERGENCE_THRESHOLD. */
  divergence: DivergenceDiagnostic[];
}

export function buildKappaReport(
  pairs: KappaPair[],
  opts?: { generatedAt?: string },
): KappaReport {
  const dimensions = aggregateKappaByDimension(pairs);
  return {
    schemaVersion: "kappa/2.0",
    generatedAt: opts?.generatedAt ?? new Date().toISOString(),
    dimensions,
    divergence: detectDivergence(dimensions),
  };
}
