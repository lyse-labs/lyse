const Z_95 = 1.959963984540054;

export function wilsonLowerBound(successes: number, trials: number, confidence = 0.95): number {
  if (trials === 0 || successes === 0) return 0;
  const z = confidence === 0.95 ? Z_95 : Math.sqrt(2) * inverseErf(2 * confidence - 1);
  const phat = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = phat + (z * z) / (2 * trials);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * trials)) / trials);
  return Math.max(0, (center - margin) / denom);
}

function inverseErf(x: number): number {
  const a = 0.147;
  const ln = Math.log(1 - x * x);
  const t = 2 / (Math.PI * a) + ln / 2;
  return Math.sign(x) * Math.sqrt(Math.sqrt(t * t - ln / a) - t);
}

export interface PromotionInput {
  successes: number;
  trials: number;
  minSamples?: number;
  threshold?: number;
  /** Measured precision; promotion requires it to be >= 0.90. null = unmeasured = never promote. */
  precisionMeasured?: number | null;
}

export function shouldPromote(input: PromotionInput): boolean {
  const minSamples = input.minSamples ?? 40;
  const threshold = input.threshold ?? 0.90;
  if (input.trials < minSamples) return false;
  if (input.precisionMeasured == null || input.precisionMeasured < 0.90) return false;
  return wilsonLowerBound(input.successes, input.trials, 0.95) >= threshold;
}
