import { wilsonLowerBound } from "../catalogue/promotion.js";
import type { KappaPair } from "./kappa-fixtures.js";

export type { KappaPair };

export interface DimensionKappaResult {
  dimensionId: string;
  kappa: number;
  n: number;
  agreement: number;
  precision: number;
  recall: number;
  precisionWilsonLb: number;
  recallWilsonLb: number;
}

export function cohenKappa(
  pairs: Array<{ staticVerdict: boolean; llmVerdict: boolean }>,
): number {
  const n = pairs.length;
  if (n === 0) return 0;

  let trueTrue = 0;
  let trueFalse = 0;
  let falseFalse = 0;
  let falseTrue = 0;

  for (const p of pairs) {
    if (p.staticVerdict && p.llmVerdict) trueTrue++;
    else if (p.staticVerdict && !p.llmVerdict) trueFalse++;
    else if (!p.staticVerdict && !p.llmVerdict) falseFalse++;
    else falseTrue++;
  }

  const po = (trueTrue + falseFalse) / n;

  const staticPos = (trueTrue + trueFalse) / n;
  const llmPos = (trueTrue + falseTrue) / n;
  const staticNeg = 1 - staticPos;
  const llmNeg = 1 - llmPos;

  const pe = staticPos * llmPos + staticNeg * llmNeg;

  if (pe >= 1) return 1;

  return (po - pe) / (1 - pe);
}

export function aggregateKappaByDimension(
  pairs: KappaPair[],
): DimensionKappaResult[] {
  const grouped = new Map<string, Array<{ staticVerdict: boolean; llmVerdict: boolean }>>();

  for (const p of pairs) {
    const existing = grouped.get(p.dimensionId);
    if (existing !== undefined) {
      existing.push({ staticVerdict: p.staticVerdict, llmVerdict: p.llmVerdict });
    } else {
      grouped.set(p.dimensionId, [{ staticVerdict: p.staticVerdict, llmVerdict: p.llmVerdict }]);
    }
  }

  const results: DimensionKappaResult[] = [];

  for (const [dimensionId, dimPairs] of grouped) {
    const n = dimPairs.length;
    const kappa = cohenKappa(dimPairs);

    let agree = 0;
    let tp = 0;
    let fp = 0;
    let fn = 0;

    for (const p of dimPairs) {
      if (p.staticVerdict === p.llmVerdict) agree++;
      if (p.staticVerdict && p.llmVerdict) tp++;
      if (!p.staticVerdict && p.llmVerdict) fp++;
      if (p.staticVerdict && !p.llmVerdict) fn++;
    }

    const agreement = agree / n;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;

    results.push({
      dimensionId,
      kappa,
      n,
      agreement,
      precision,
      recall,
      precisionWilsonLb: wilsonLowerBound(tp, tp + fp),
      recallWilsonLb: wilsonLowerBound(tp, tp + fn),
    });
  }

  results.sort((a, b) => a.dimensionId.localeCompare(b.dimensionId));
  return results;
}
