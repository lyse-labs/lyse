import type { ConfusionMatrix } from "./types.js";

export function emptyMatrix(): ConfusionMatrix {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

/** label: true = a violation was injected; flagged: true = the rule reported it. */
export function addObservation(m: ConfusionMatrix, label: boolean, flagged: boolean): ConfusionMatrix {
  if (label && flagged) return { ...m, tp: m.tp + 1 };
  if (label && !flagged) return { ...m, fn: m.fn + 1 };
  if (!label && flagged) return { ...m, fp: m.fp + 1 };
  return { ...m, tn: m.tn + 1 };
}

/**
 * Youden's J = sensitivity + specificity − 1, in [−1, 1].
 * Returns 0 when either class is unobserved (no signal), which also makes a
 * flag-everything detector score 0 (specificity collapses to 0).
 */
export function youdensJ(m: ConfusionMatrix): number {
  const positives = m.tp + m.fn;
  const negatives = m.tn + m.fp;
  if (positives === 0 || negatives === 0) return 0;
  const sensitivity = m.tp / positives;
  const specificity = m.tn / negatives;
  return sensitivity + specificity - 1;
}
