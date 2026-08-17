/**
 * Small statistics toolbox used by the detection heuristics.
 *
 * Deliberately dependency-free and deliberately *robust* (median / MAD rather
 * than mean / stdev wherever a single outlier could distort the result). Bank
 * statements are full of one-off outliers: a double charge, a refund and
 * re-charge, a pro-rata top-up. Mean-based statistics fall apart on those.
 */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Median absolute deviation — the outlier-resistant sibling of stdDev. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/**
 * Coefficient of variation against the median.
 * ~0 for a fixed-price subscription; >0.15 signals a variable utility bill.
 */
export function coefficientOfVariation(values: readonly number[]): number {
  const m = median(values);
  if (m === 0) return 0;
  return stdDev(values) / Math.abs(m);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps a value onto 0..1, saturating outside [min, max]. */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/**
 * Circular median of days-of-month.
 *
 * A subscription charged on the 31st shows up as {31, 1, 30, 31, 2} once short
 * months and weekend settlement shift it. A linear median returns 30 — nearly
 * a full cycle away from the truth. Treating the month as a circle of 30.44
 * days and minimising circular distance recovers the real anchor.
 */
export function circularMedianDayOfMonth(days: readonly number[]): number {
  if (days.length === 0) return 1;
  const period = 30.44;
  let best = days[0]!;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const candidate of days) {
    const cost = days.reduce(
      (acc, d) => acc + circularDistance(d, candidate, period),
      0,
    );
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

export function circularDistance(a: number, b: number, period: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, period - raw);
}

/**
 * Sørensen–Dice coefficient over character bigrams, 0..1.
 *
 * The fallback matcher for merchants absent from the dictionary. Chosen over
 * Levenshtein because it is length-insensitive and tolerant of the token
 * re-ordering that bank descriptors love ("SPOTIFY AB STOCKHOLM" vs
 * "STOCKHOLM SPOTIFY").
 */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };

  const first = bigrams(a);
  const second = bigrams(b);
  let intersection = 0;
  let firstTotal = 0;
  let secondTotal = 0;

  for (const count of first.values()) firstTotal += count;
  for (const [gram, count] of second) {
    secondTotal += count;
    const inFirst = first.get(gram);
    if (inFirst) intersection += Math.min(inFirst, count);
  }

  return (2 * intersection) / (firstTotal + secondTotal);
}

/**
 * Groups sorted numbers into clusters separated by more than `tolerance`
 * (expressed as a fraction of the cluster's running median).
 *
 * This is how a price history of [5999, 5999, 5999, 9999, 9999] becomes two
 * price levels rather than five independent amounts.
 */
export interface NumericCluster {
  values: number[];
  center: number;
  startIndex: number;
  endIndex: number;
}

export function clusterSequential(
  values: readonly number[],
  relativeTolerance: number,
): NumericCluster[] {
  const clusters: NumericCluster[] = [];
  let current: number[] = [];
  let startIndex = 0;

  values.forEach((value, index) => {
    if (current.length === 0) {
      current = [value];
      startIndex = index;
      return;
    }
    const center = median(current);
    const withinTolerance =
      center === 0 ? value === 0 : Math.abs(value - center) / Math.abs(center) <= relativeTolerance;

    if (withinTolerance) {
      current.push(value);
    } else {
      clusters.push({
        values: current,
        center: median(current),
        startIndex,
        endIndex: index - 1,
      });
      current = [value];
      startIndex = index;
    }
  });

  if (current.length > 0) {
    clusters.push({
      values: current,
      center: median(current),
      startIndex,
      endIndex: values.length - 1,
    });
  }
  return clusters;
}
