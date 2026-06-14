/**
 * Rank correlation utilities. `spearmanRho` is the external-validity gate
 * statistic (Track #72): correlate Lyse's scores against an independent
 * ordinal anchor (e.g. published human AI-readiness levels). Spearman is the
 * right choice because the anchor is ordinal with ties, and the relationship
 * we test is monotonic, not linear.
 */

/** Average ranks (1-based), ties share the mean of the positions they span. */
function averageRanks(values: readonly number[]): number[] {
  const n = values.length;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => values[a]! - values[b]!,
  );
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]!]! === values[order[i]!]!) j++;
    // positions i..j (0-based) → 1-based ranks (i+1)..(j+1); mean of those
    const meanRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) ranks[order[k]!] = meanRank;
    i = j + 1;
  }
  return ranks;
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= n;
  my /= n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  const denom = Math.sqrt(vx * vy);
  if (denom === 0) return NaN; // a series with zero variance → undefined
  return cov / denom;
}

/**
 * Spearman's rank correlation coefficient between two equal-length series.
 * Returns NaN when n < 2 or when either series is constant (zero variance).
 * Throws on length mismatch. Tie-safe (rank-then-Pearson, not the no-ties
 * 1 − 6Σd²/n(n²−1) shortcut).
 */
export function spearmanRho(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length) {
    throw new Error(`spearmanRho: length mismatch (${x.length} vs ${y.length})`);
  }
  if (x.length < 2) return NaN;
  return pearson(averageRanks(x), averageRanks(y));
}
