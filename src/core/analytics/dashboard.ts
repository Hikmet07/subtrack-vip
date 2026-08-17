/**
 * Comparative analytics for the dashboard.
 *
 * One honesty problem dominates this module. On the 17th of the month, "this
 * month vs last month" is a comparison between a half-finished month and a
 * complete one, and every naive implementation of it reports a fake 45% saving.
 *
 * We solve it by projecting the current month to completion: charges already
 * booked, plus the renewals the predictor says will land before month end. The
 * UI labels that figure "öngörülen" (projected) so the number is never passed
 * off as settled fact, and `currentMonthActual` stays available alongside it.
 */

import type {
  DetectedSubscription,
  ProviderTransaction,
  SubscriptionCategory,
} from '../types';
import {
  addMonthsClamped,
  daysBetween,
  endOfMonthUTC,
  formatMonthKeyTR,
  monthKey,
  startOfMonthUTC,
  trailingMonthKeys,
  utcDate,
} from '../utils/date';
import { percentDelta, sumKurus, type Kurus } from '../utils/money';

export interface BurnRatePoint {
  monthKey: string;
  /** "Nis 26" — ready for the chart axis. */
  label: string;
  /** Fixed-price subscriptions only. */
  subscriptions: Kurus;
  /** Variable utility & telecom bills. */
  bills: Kurus;
  total: Kurus;
  /** True for the current, still-incomplete month. */
  isProjected: boolean;
}

export interface BurnRateAnalytics {
  currentMonthActual: Kurus;
  /** Actual so far + renewals still expected before month end. */
  currentMonth: Kurus;
  previousMonth: Kurus;
  deltaAmount: Kurus;
  deltaPercent: number;
  /** Trailing 12 months, oldest first. */
  series: BurnRatePoint[];
  /** Mean of the last six complete months. */
  sixMonthAverage: Kurus;
}

export interface CategorySlice {
  category: SubscriptionCategory;
  monthlyAmount: Kurus;
  annualAmount: Kurus;
  count: number;
  /** 0..1 of the total monthly burn. */
  share: number;
}

export interface ProjectionAnalytics {
  /** Committed monthly run-rate across everything still live. */
  committedMonthlyRunRate: Kurus;
  realizedYearToDate: Kurus;
  projectedAnnual: Kurus;
  /** Calendar-year spend still ahead of the user. */
  remainingThisYear: Kurus;
  /** Fraction of the year already elapsed, 0..1. */
  yearElapsed: number;
}

export interface PriceHikeEntry {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  previousAmount: Kurus;
  newAmount: Kurus;
  deltaAmount: Kurus;
  deltaPercent: number;
  effectiveAt: Date;
  extraPaidToDate: Kurus;
  /** Extra cost over the next twelve months if nothing changes. */
  projectedAnnualImpact: Kurus;
}

export interface UpcomingRenewal {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  amount: Kurus;
  renewalAt: Date;
  windowDays: number;
  daysUntil: number;
}

export interface SavingsAnalytics {
  potentialMonthlySaving: Kurus;
  potentialAnnualSaving: Kurus;
  zombieCount: number;
  /** Already cancelled — money that has genuinely stopped leaving. */
  realizedAnnualSaving: Kurus;
}

export interface SpendContext {
  /** All debit spend in the trailing complete month. */
  totalMonthlySpend: Kurus;
  /** Share of that spend which is recurring. 0..1 */
  subscriptionShare: number;
}

export interface DashboardAnalytics {
  burnRate: BurnRateAnalytics;
  categoryBreakdown: CategorySlice[];
  projection: ProjectionAnalytics;
  priceHikeRadar: PriceHikeEntry[];
  upcomingRenewals: UpcomingRenewal[];
  savings: SavingsAnalytics;
  spendContext: SpendContext;
  totals: {
    liveCount: number;
    monthlyTotal: Kurus;
    annualTotal: Kurus;
  };
}

export interface BuildAnalyticsInput {
  subscriptions: DetectedSubscription[];
  transactions: ProviderTransaction[];
  now: Date;
  monthsOfHistory?: number;
  priceHikeLookbackMonths?: number;
}

const LIVE_STATES = new Set(['ACTIVE', 'VARIABLE_BILL', 'CANCELLATION_STARTED']);

export function buildDashboardAnalytics(input: BuildAnalyticsInput): DashboardAnalytics {
  const { subscriptions, transactions, now } = input;
  const monthsOfHistory = input.monthsOfHistory ?? 12;
  const lookback = input.priceHikeLookbackMonths ?? 12;

  const live = subscriptions.filter((subscription) => LIVE_STATES.has(subscription.state));

  const burnRate = buildBurnRate(subscriptions, now, monthsOfHistory);
  const categoryBreakdown = buildCategoryBreakdown(live);
  const projection = buildProjection(subscriptions, live, now);
  const priceHikeRadar = buildPriceHikeRadar(subscriptions, now, lookback);
  const upcomingRenewals = buildUpcomingRenewals(live, now);
  const savings = buildSavings(subscriptions);
  const spendContext = buildSpendContext(transactions, burnRate, now);

  return {
    burnRate,
    categoryBreakdown,
    projection,
    priceHikeRadar,
    upcomingRenewals,
    savings,
    spendContext,
    totals: {
      liveCount: live.length,
      monthlyTotal: sumKurus(live.map((subscription) => subscription.monthlyEquivalent)),
      annualTotal: sumKurus(live.map((subscription) => subscription.annualEquivalent)),
    },
  };
}

// -----------------------------------------------------------------------------
//  Burn rate
// -----------------------------------------------------------------------------

function buildBurnRate(
  subscriptions: DetectedSubscription[],
  now: Date,
  months: number,
): BurnRateAnalytics {
  const keys = trailingMonthKeys(now, months);
  const currentKey = monthKey(now);

  const subsByMonth = new Map<string, Kurus>();
  const billsByMonth = new Map<string, Kurus>();

  for (const subscription of subscriptions) {
    const target = subscription.state === 'VARIABLE_BILL' ? billsByMonth : subsByMonth;
    for (const charge of subscription.charges) {
      const key = monthKey(charge.bookedAt);
      target.set(key, (target.get(key) ?? 0) + charge.amount);
    }
  }

  /**
   * Renewals expected between today and month end. Without this, the current
   * month always looks artificially cheap and the month-over-month delta is a
   * lie for 29 days out of 30.
   */
  const monthEnd = endOfMonthUTC(now);
  let expectedRemainingSubs = 0;
  let expectedRemainingBills = 0;
  for (const subscription of subscriptions) {
    if (!LIVE_STATES.has(subscription.state)) continue;
    const renewal = subscription.nextRenewalAt;
    if (renewal && renewal > now && renewal <= monthEnd) {
      if (subscription.state === 'VARIABLE_BILL') expectedRemainingBills += subscription.currentAmount;
      else expectedRemainingSubs += subscription.currentAmount;
    }
  }
  const expectedRemaining = expectedRemainingSubs + expectedRemainingBills;

  const series: BurnRatePoint[] = keys.map((key) => {
    const isCurrent = key === currentKey;
    // The projected remainder is folded into the individual series, not just
    // the total. Adding it to `total` alone would make the stacked chart show a
    // cliff in the current month while the headline figure said spending was
    // up — the same page contradicting itself.
    const subs = (subsByMonth.get(key) ?? 0) + (isCurrent ? expectedRemainingSubs : 0);
    const bills = (billsByMonth.get(key) ?? 0) + (isCurrent ? expectedRemainingBills : 0);
    return {
      monthKey: key,
      label: formatMonthKeyTR(key),
      subscriptions: subs,
      bills,
      total: subs + bills,
      isProjected: isCurrent,
    };
  });

  const currentMonthActual =
    (subsByMonth.get(currentKey) ?? 0) + (billsByMonth.get(currentKey) ?? 0);
  const currentMonth = currentMonthActual + expectedRemaining;

  const previousKey = monthKey(addMonthsClamped(startOfMonthUTC(now), -1));
  const previousMonth = (subsByMonth.get(previousKey) ?? 0) + (billsByMonth.get(previousKey) ?? 0);

  // Complete months only — the current one is still moving.
  const completeMonths = series.filter((point) => !point.isProjected).slice(-6);
  const sixMonthAverage =
    completeMonths.length > 0
      ? Math.round(sumKurus(completeMonths.map((point) => point.total)) / completeMonths.length)
      : 0;

  return {
    currentMonthActual,
    currentMonth,
    previousMonth,
    deltaAmount: currentMonth - previousMonth,
    deltaPercent: percentDelta(previousMonth, currentMonth),
    series,
    sixMonthAverage,
  };
}

// -----------------------------------------------------------------------------
//  Category breakdown
// -----------------------------------------------------------------------------

function buildCategoryBreakdown(live: DetectedSubscription[]): CategorySlice[] {
  const byCategory = new Map<SubscriptionCategory, { monthly: Kurus; annual: Kurus; count: number }>();

  for (const subscription of live) {
    const entry = byCategory.get(subscription.category) ?? { monthly: 0, annual: 0, count: 0 };
    entry.monthly += subscription.monthlyEquivalent;
    entry.annual += subscription.annualEquivalent;
    entry.count += 1;
    byCategory.set(subscription.category, entry);
  }

  const total = sumKurus([...byCategory.values()].map((entry) => entry.monthly));

  return [...byCategory.entries()]
    .map(([category, entry]) => ({
      category,
      monthlyAmount: entry.monthly,
      annualAmount: entry.annual,
      count: entry.count,
      share: total > 0 ? entry.monthly / total : 0,
    }))
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

// -----------------------------------------------------------------------------
//  Annual projection
// -----------------------------------------------------------------------------

function buildProjection(
  all: DetectedSubscription[],
  live: DetectedSubscription[],
  now: Date,
): ProjectionAnalytics {
  const yearStart = utcDate(now.getUTCFullYear(), 1, 1);
  const yearEnd = utcDate(now.getUTCFullYear(), 12, 31);
  const yearLength = daysBetween(yearStart, yearEnd) + 1;
  const elapsedDays = daysBetween(yearStart, now) + 1;
  const yearElapsed = elapsedDays / yearLength;

  // Realised: what actually left the account this calendar year.
  let realizedYearToDate = 0;
  for (const subscription of all) {
    for (const charge of subscription.charges) {
      if (charge.bookedAt >= yearStart && charge.bookedAt <= now) {
        realizedYearToDate += charge.amount;
      }
    }
  }

  const committedMonthlyRunRate = sumKurus(
    live.map((subscription) => subscription.monthlyEquivalent),
  );

  // Remaining spend is the run-rate applied to the fraction of the year left —
  // NOT a naive `runRate * 12`, which would double-count everything already paid.
  const remainingMonths = ((1 - yearElapsed) * yearLength) / 30.44;
  const remainingThisYear = Math.round(committedMonthlyRunRate * remainingMonths);

  return {
    committedMonthlyRunRate,
    realizedYearToDate,
    projectedAnnual: realizedYearToDate + remainingThisYear,
    remainingThisYear,
    yearElapsed,
  };
}

// -----------------------------------------------------------------------------
//  Price Hike Radar
// -----------------------------------------------------------------------------

function buildPriceHikeRadar(
  subscriptions: DetectedSubscription[],
  now: Date,
  lookbackMonths: number,
): PriceHikeEntry[] {
  const cutoff = addMonthsClamped(now, -lookbackMonths);
  const entries: PriceHikeEntry[] = [];

  for (const subscription of subscriptions) {
    for (const change of subscription.priceChanges) {
      if (change.isDecrease || change.effectiveAt < cutoff) continue;

      const periodsPerYear = 365.25 / Math.max(subscription.cycleDays, 1);
      entries.push({
        merchantKey: subscription.merchantKey,
        merchantName: subscription.merchantName,
        category: subscription.category,
        previousAmount: change.previousAmount,
        newAmount: change.newAmount,
        deltaAmount: change.deltaAmount,
        deltaPercent: change.deltaPercent,
        effectiveAt: change.effectiveAt,
        extraPaidToDate: change.extraPaidToDate,
        projectedAnnualImpact: Math.round(change.deltaAmount * periodsPerYear),
      });
    }
  }

  // Ranked by money actually lost, not by headline percentage: a 60% hike on a
  // ₺50 service matters less than a 15% hike on a ₺1.289 one.
  return entries.sort((a, b) => b.extraPaidToDate - a.extraPaidToDate);
}

// -----------------------------------------------------------------------------
//  Renewals & savings
// -----------------------------------------------------------------------------

function buildUpcomingRenewals(live: DetectedSubscription[], now: Date): UpcomingRenewal[] {
  return live
    .filter((subscription): subscription is DetectedSubscription & { nextRenewalAt: Date } =>
      Boolean(subscription.nextRenewalAt),
    )
    .map((subscription) => ({
      merchantKey: subscription.merchantKey,
      merchantName: subscription.merchantName,
      category: subscription.category,
      amount: subscription.currentAmount,
      renewalAt: subscription.nextRenewalAt,
      windowDays: subscription.renewalWindowDays,
      daysUntil: daysBetween(now, subscription.nextRenewalAt),
    }))
    .sort((a, b) => a.renewalAt.getTime() - b.renewalAt.getTime());
}

function buildSavings(subscriptions: DetectedSubscription[]): SavingsAnalytics {
  const zombies = subscriptions.filter(
    (subscription) =>
      subscription.state === 'ACTIVE' &&
      (subscription.riskBand === 'HIGH' || subscription.riskBand === 'CRITICAL'),
  );

  const cancelled = subscriptions.filter((subscription) => subscription.state === 'CANCELLED');

  return {
    potentialMonthlySaving: sumKurus(zombies.map((subscription) => subscription.monthlyEquivalent)),
    potentialAnnualSaving: sumKurus(zombies.map((subscription) => subscription.annualEquivalent)),
    zombieCount: zombies.length,
    realizedAnnualSaving: sumKurus(cancelled.map((subscription) => subscription.annualEquivalent)),
  };
}

function buildSpendContext(
  transactions: ProviderTransaction[],
  burnRate: BurnRateAnalytics,
  now: Date,
): SpendContext {
  const previousMonthKey = monthKey(addMonthsClamped(startOfMonthUTC(now), -1));

  const totalMonthlySpend = sumKurus(
    transactions
      .filter(
        (txn) => txn.direction === 'DEBIT' && monthKey(txn.bookedAt) === previousMonthKey,
      )
      .map((txn) => txn.amount),
  );

  return {
    totalMonthlySpend,
    subscriptionShare:
      totalMonthlySpend > 0 ? burnRate.previousMonth / totalMonthlySpend : 0,
  };
}
