import type { ConfusionMatrix } from "../types.js";
import { wilsonLowerBound } from "./promotion.js";

export interface Measurement {
  precisionMeasured: number | null;
  recallMeasured: number | null;
  precisionWilsonLowerBound: number | null;
  recallWilsonLowerBound: number | null;
  nSamples: number;
}

export function deriveMeasurement(m: ConfusionMatrix): Measurement {
  const predictedPos = m.tp + m.fp;
  const actualPos = m.tp + m.fn;
  return {
    precisionMeasured: predictedPos > 0 ? m.tp / predictedPos : null,
    recallMeasured: actualPos > 0 ? m.tp / actualPos : null,
    precisionWilsonLowerBound: predictedPos > 0 ? wilsonLowerBound(m.tp, predictedPos) : null,
    recallWilsonLowerBound: actualPos > 0 ? wilsonLowerBound(m.tp, actualPos) : null,
    nSamples: m.tp + m.fp + m.tn + m.fn,
  };
}
