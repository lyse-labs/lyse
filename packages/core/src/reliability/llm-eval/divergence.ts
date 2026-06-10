import type { DimensionKappaResult } from "./kappa.js";

/**
 * Landis & Koch (1977): kappa < 0.40 = "poor agreement".
 * A static rule whose kappa falls below this threshold has drifted from
 * the expert/LLM signal and should stay (or return) to `experimental`.
 */
export const DIVERGENCE_THRESHOLD = 0.4;

/**
 * A diagnostic about a static RULE, not a DS-facing Finding.
 * It has no severity, message, file, or line — it targets the rule author,
 * not the design-system consumer.
 */
export interface DivergenceDiagnostic {
  type: "rule-divergence";
  dimensionId: string;
  kappa: number;
  /** 1 − observed agreement (fraction of pairs where static ≠ LLM) */
  disagreementRate: number;
}

/**
 * Given per-dimension kappa results from `aggregateKappaByDimension`,
 * return a diagnostic for every dimension whose kappa is strictly below
 * `DIVERGENCE_THRESHOLD`. Dimensions at or above the threshold are not
 * flagged.
 *
 * The function is pure and deterministic: same input → same output.
 */
export function detectDivergence(
  dimensions: DimensionKappaResult[],
): DivergenceDiagnostic[] {
  const result: DivergenceDiagnostic[] = [];

  for (const dim of dimensions) {
    if (dim.kappa < DIVERGENCE_THRESHOLD) {
      result.push({
        type: "rule-divergence",
        dimensionId: dim.dimensionId,
        kappa: dim.kappa,
        disagreementRate: 1 - dim.agreement,
      });
    }
  }

  return result;
}
