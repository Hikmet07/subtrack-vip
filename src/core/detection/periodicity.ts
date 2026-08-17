/**
 * Frequency & periodicity matrix.
 *
 * Turns a list of charge dates into a billing cycle, or rejects the stream.
 * The governing rule from the product spec: **at least two consecutive
 * recurring intervals** are required before anything is called a subscription.
 * That means three charges minimum — a single repeat is a coincidence, two in a
 * row is a pattern.
 *
 * Everything here is robust-statistics based (median / MAD rather than
 * mean / stdev) because real statements always contain one weird gap.
 */

import type { BillingCycle } from '../types';
import { daysBetween } from '../utils/date';
import {
  circularDistance,
  circularMedianDayOfMonth,
  clamp,
  median,
  medianAbsoluteDeviation,
} from '../utils/stats';

export interface CycleDefinition {
  cycle: BillingCycle;
  nominalDays: number;
  minDays: number;
  maxDays: number;
  /** The tight band the spec calls out; intervals inside it score full marks. */
  coreMinDays: number;
  coreMaxDays: number;
}

/**
 * The matrix itself. Windows are wider than the textbook values because bank
 * settlement, weekends and short months routinely push a "monthly" charge to
 * 26 or 34 days apart.
 */
export const CYCLE_MATRIX: CycleDefinition[] = [
  { cycle: 'WEEKLY', nominalDays: 7, minDays: 6, maxDays: 8, coreMinDays: 6, coreMaxDays: 8 },
  { cycle: 'MONTHLY', nominalDays: 30, minDays: 25, maxDays: 36, coreMinDays: 28, coreMaxDays: 32 },
  { cycle: 'QUARTERLY', nominalDays: 91, minDays: 80, maxDays: 100, coreMinDays: 88, coreMaxDays: 94 },
  { cycle: 'SEMIANNUAL', nominalDays: 182, minDays: 168, maxDays: 196, coreMinDays: 178, coreMaxDays: 186 },
  { cycle: 'YEARLY', nominalDays: 365, minDays: 348, maxDays: 382, coreMinDays: 360, coreMaxDays: 370 },
];

/** Charges closer together than this are treated as one billing event. */
const DUPLICATE_WINDOW_DAYS = 3;

/** How many consecutive periods may be skipped and still count as the cycle. */
const MAX_SKIPPED_PERIODS = 3;

export type PeriodicityRejection =
  | 'INSUFFICIENT_HISTORY'
  | 'NO_MATCHING_CYCLE'
  | 'NO_CONSECUTIVE_INTERVALS'
  | 'IRREGULAR_INTERVALS';

export interface PeriodicityResult {
  isRecurring: boolean;
  cycle: BillingCycle;
  /** Observed median interval, normalised for skipped periods. */
  cycleDays: number;
  intervals: number[];
  medianIntervalDays: number;
  /** 0..1 — how metronomic the stream is. */
  regularity: number;
  /** Longest run of intervals that matched the winning cycle. */
  consecutiveMatches: number;
  missedPeriods: number;
  anchorDayOfMonth: number;
  /** 0..1 — how tightly charges cling to the anchor day. */
  anchorAdherence: number;
  /** Charge dates after duplicate collapsing. */
  effectiveDates: Date[];
  duplicatesCollapsed: number;
  rejectedReason?: PeriodicityRejection;
}

/**
 * Collapses retry/double charges.
 *
 * A merchant whose settlement fails and is re-presented the next day produces
 * two lines one day apart. Left alone that injects a 1-day interval which
 * destroys the regularity score, so we fold them into a single billing event.
 */
function collapseDuplicates(dates: Date[]): { dates: Date[]; collapsed: number } {
  if (dates.length === 0) return { dates: [], collapsed: 0 };
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const out: Date[] = [sorted[0]!];
  let collapsed = 0;

  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(out[out.length - 1]!, sorted[i]!);
    if (gap <= DUPLICATE_WINDOW_DAYS) collapsed++;
    else out.push(sorted[i]!);
  }
  return { dates: out, collapsed };
}

/**
 * Does `interval` match `definition`, possibly as k skipped periods?
 * Returns the multiple (1 = clean, 2 = one period missed) or 0 for no match.
 */
function matchMultiple(interval: number, definition: CycleDefinition): number {
  for (let k = 1; k <= MAX_SKIPPED_PERIODS + 1; k++) {
    const lo = definition.minDays * k - (k - 1) * 2;
    const hi = definition.maxDays * k + (k - 1) * 2;
    if (interval >= lo && interval <= hi) return k;
  }
  return 0;
}

/** Longest run of consecutive non-zero entries. */
function longestRun(multiples: number[]): number {
  let best = 0;
  let current = 0;
  for (const m of multiples) {
    if (m > 0) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

export function analyzePeriodicity(chargeDates: Date[]): PeriodicityResult {
  const { dates, collapsed } = collapseDuplicates(chargeDates);

  const empty = (reason: PeriodicityRejection): PeriodicityResult => ({
    isRecurring: false,
    cycle: 'IRREGULAR',
    cycleDays: 0,
    intervals: [],
    medianIntervalDays: 0,
    regularity: 0,
    consecutiveMatches: 0,
    missedPeriods: 0,
    anchorDayOfMonth: dates[0]?.getUTCDate() ?? 1,
    anchorAdherence: 0,
    effectiveDates: dates,
    duplicatesCollapsed: collapsed,
    rejectedReason: reason,
  });

  // Two consecutive intervals => three charges. This is the hard floor.
  if (dates.length < 3) return empty('INSUFFICIENT_HISTORY');

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1]!, dates[i]!));

  // Score every cycle in the matrix and keep the best.
  let winner: {
    definition: CycleDefinition;
    multiples: number[];
    run: number;
    coreHits: number;
  } | null = null;

  for (const definition of CYCLE_MATRIX) {
    const multiples = intervals.map((interval) => matchMultiple(interval, definition));
    const run = longestRun(multiples);
    if (run < 2) continue; // the two-consecutive-intervals rule

    const coreHits = intervals.filter(
      (interval, index) =>
        multiples[index] === 1 &&
        interval >= definition.coreMinDays &&
        interval <= definition.coreMaxDays,
    ).length;

    const better =
      !winner ||
      run > winner.run ||
      (run === winner.run && coreHits > winner.coreHits) ||
      // Prefer the shorter cycle on a tie: a 30-day stream also "fits" a
      // 60-day cycle at multiple 2, and monthly is the truthful reading.
      (run === winner.run &&
        coreHits === winner.coreHits &&
        definition.nominalDays < winner.definition.nominalDays);

    if (better) winner = { definition, multiples, run, coreHits };
  }

  if (!winner) {
    const anyMatch = CYCLE_MATRIX.some((definition) =>
      intervals.some((interval) => matchMultiple(interval, definition) > 0),
    );
    return empty(anyMatch ? 'NO_CONSECUTIVE_INTERVALS' : 'NO_MATCHING_CYCLE');
  }

  // Normalise skipped periods back to a single-period length before averaging.
  const normalized = intervals
    .map((interval, index) => (winner!.multiples[index]! > 0 ? interval / winner!.multiples[index]! : null))
    .filter((value): value is number => value !== null);

  const medianInterval = median(normalized);
  const dispersion = medianAbsoluteDeviation(normalized);
  const regularity = clamp(1 - dispersion / Math.max(medianInterval * 0.25, 1), 0, 1);

  const missedPeriods = winner.multiples.reduce(
    (acc, multiple) => acc + (multiple > 1 ? multiple - 1 : 0),
    0,
  );

  // Anchor-day analysis. Only meaningful for cycles of a month or longer.
  const daysOfMonth = dates.map((date) => date.getUTCDate());
  const anchorDay = circularMedianDayOfMonth(daysOfMonth);
  const avgAnchorDrift =
    daysOfMonth.reduce((acc, day) => acc + circularDistance(day, anchorDay, 30.44), 0) /
    daysOfMonth.length;
  const anchorAdherence =
    winner.definition.nominalDays >= 25 ? clamp(1 - avgAnchorDrift / 6, 0, 1) : 1;

  // A stream can match a cycle yet still be wildly irregular overall.
  if (regularity < 0.25) {
    return { ...empty('IRREGULAR_INTERVALS'), intervals, medianIntervalDays: medianInterval };
  }

  return {
    isRecurring: true,
    cycle: winner.definition.cycle,
    cycleDays: Math.round(medianInterval),
    intervals,
    medianIntervalDays: medianInterval,
    regularity,
    consecutiveMatches: winner.run,
    missedPeriods,
    anchorDayOfMonth: anchorDay,
    anchorAdherence,
    effectiveDates: dates,
    duplicatesCollapsed: collapsed,
  };
}

// -----------------------------------------------------------------------------
//  Aggregator splitting
// -----------------------------------------------------------------------------

export interface AggregatorSplitInput<T> {
  item: T;
  bookedAt: Date;
}

export interface AggregatorSplitGroup<T> {
  /** Suffix appended to the merchant key, e.g. "d08". */
  discriminator: string;
  anchorDay: number;
  items: T[];
}

/**
 * Splits an aggregator stream (Apple, Google Play) into its constituent
 * subscriptions.
 *
 * `APPLE.COM/BILL` is a single descriptor covering every in-app purchase the
 * user has. Treating it as one subscription would report "Apple — ₺230/ay",
 * which is useless for cancellation. Apple does, however, bill each product on
 * its own anniversary, so charges cluster tightly around distinct days of the
 * month. Clustering on the anchor day recovers the individual products.
 *
 * Where two products genuinely share an anniversary they are inseparable from
 * the statement alone — the caller flags those for manual labelling rather than
 * guessing.
 */
export function splitAggregatorStream<T>(
  entries: AggregatorSplitInput<T>[],
  toleranceDays = 4,
): AggregatorSplitGroup<T>[] {
  if (entries.length === 0) return [];

  const groups: Array<{ anchorSum: number; count: number; anchor: number; items: T[]; days: number[] }> = [];

  for (const entry of [...entries].sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime())) {
    const day = entry.bookedAt.getUTCDate();
    const target = groups.find((group) => circularDistance(day, group.anchor, 30.44) <= toleranceDays);

    if (target) {
      target.items.push(entry.item);
      target.days.push(day);
      target.anchor = circularMedianDayOfMonth(target.days);
      target.count++;
    } else {
      groups.push({ anchorSum: day, count: 1, anchor: day, items: [entry.item], days: [day] });
    }
  }

  return groups
    .sort((a, b) => b.items.length - a.items.length)
    .map((group) => ({
      discriminator: `d${String(group.anchor).padStart(2, '0')}`,
      anchorDay: group.anchor,
      items: group.items,
    }));
}
