/**
 * Renewal predictor.
 *
 * Predicting the next charge is deceptively subtle. Adding `cycleDays` to the
 * last charge drifts: 30-day arithmetic applied twelve times lands five days
 * early by December. Card networks bill on the *anniversary day*, clamped to
 * the length of the target month, so that is what we reproduce.
 *
 * The predictor also decides when a stream has simply stopped. A subscription
 * that is more than 1.5 cycles overdue is not "late" — it has lapsed, and
 * predicting a phantom renewal for it would put a lie on the dashboard.
 */

import type { BillingCycle } from '../types';
import { addDays, addMonthsClamped, atNoonUTC, daysBetween, daysInMonth } from '../utils/date';
import { clamp } from '../utils/stats';

export interface RenewalPredictionInput {
  lastChargedAt: Date;
  cycleDays: number;
  cycle: BillingCycle;
  anchorDayOfMonth: number;
  /** 0..1 from the periodicity analysis; drives the confidence window. */
  regularity: number;
  now: Date;
}

export interface RenewalPrediction {
  /** Undefined when the stream has lapsed. */
  nextRenewalAt?: Date;
  /** ± days of tolerance around the prediction. */
  windowDays: number;
  daysUntil?: number;
  /** The expected charge never arrived and the grace period has expired. */
  hasLapsed: boolean;
  /** Expected charge is late but still inside the grace period. */
  isOverdue: boolean;
  cyclesMissed: number;
}

/** How far past the expected date a stream is presumed lapsed. */
const LAPSE_TOLERANCE_CYCLES = 1.5;

const MONTHS_PER_CYCLE: Partial<Record<BillingCycle, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

export function predictNextRenewal(input: RenewalPredictionInput): RenewalPrediction {
  const { lastChargedAt, cycleDays, cycle, anchorDayOfMonth, regularity, now } = input;

  if (cycleDays <= 0) {
    return { windowDays: 0, hasLapsed: false, isOverdue: false, cyclesMissed: 0 };
  }

  const monthsPerCycle = MONTHS_PER_CYCLE[cycle];
  let candidate = advance(lastChargedAt, monthsPerCycle, cycleDays, anchorDayOfMonth);

  // Roll forward through any periods that have already been missed.
  let cyclesMissed = 0;
  while (candidate.getTime() < now.getTime() && cyclesMissed < 60) {
    const overdueDays = daysBetween(candidate, now);
    if (overdueDays <= cycleDays * LAPSE_TOLERANCE_CYCLES) break;
    candidate = advance(candidate, monthsPerCycle, cycleDays, anchorDayOfMonth);
    cyclesMissed++;
  }

  const daysSinceLastCharge = daysBetween(lastChargedAt, now);
  const hasLapsed = daysSinceLastCharge > cycleDays * (1 + LAPSE_TOLERANCE_CYCLES);

  if (hasLapsed) {
    return {
      windowDays: 0,
      hasLapsed: true,
      isOverdue: false,
      cyclesMissed,
    };
  }

  // Irregular streams get a wider stated window rather than a false precision.
  const windowDays = Math.round(clamp(1 + (1 - regularity) * 5, 1, 7));
  const daysUntil = daysBetween(now, candidate);

  return {
    nextRenewalAt: candidate,
    windowDays,
    daysUntil,
    hasLapsed: false,
    isOverdue: daysUntil < 0,
    cyclesMissed,
  };
}

/**
 * Advances one billing period.
 *
 * For monthly-and-longer cycles this is calendar arithmetic snapped to the
 * anchor day (the 31st becomes the 28th in February, exactly as a card network
 * would bill it). For weekly and irregular cycles, day arithmetic is correct.
 */
function advance(
  from: Date,
  monthsPerCycle: number | undefined,
  cycleDays: number,
  anchorDayOfMonth: number,
): Date {
  if (!monthsPerCycle) return atNoonUTC(addDays(from, cycleDays));

  const stepped = addMonthsClamped(from, monthsPerCycle);
  const year = stepped.getUTCFullYear();
  const monthIndex = stepped.getUTCMonth();
  const day = Math.min(anchorDayOfMonth, daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
}

/**
 * Renewals falling inside the user's alert lead time, soonest first.
 * Anything already overdue is surfaced first — a charge that should have hit
 * yesterday is more urgent than one due next week.
 */
export function selectUpcomingRenewals<T extends { nextRenewalAt?: Date }>(
  items: T[],
  now: Date,
  leadDays: number,
): T[] {
  const horizon = addDays(now, leadDays);
  return items
    .filter((item) => item.nextRenewalAt && item.nextRenewalAt <= horizon)
    .sort((a, b) => a.nextRenewalAt!.getTime() - b.nextRenewalAt!.getTime());
}
