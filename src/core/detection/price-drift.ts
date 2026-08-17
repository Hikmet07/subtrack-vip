/**
 * Price drift, hikes and volatility classification.
 *
 * Three different things can make a recurring amount change, and conflating
 * them is the classic failure mode of naive detectors — especially in Turkey:
 *
 *   FIXED      ₺299,99 every month.
 *   FX_DRIFT   A USD-priced service billed in lira. The amount moves 2–3% every
 *              single month with the exchange rate. This is NOT a price hike
 *              and must never be reported as one, or the Price Hike Radar would
 *              fire twelve times a year on ChatGPT Plus alone.
 *   STEPPED    A genuine hike: Spotify 59,99 -> 99,99. One sustained step up,
 *              then stability at the new level.
 *   VARIABLE   A utility bill. İGDAŞ costs ₺60 in July and ₺2.400 in January.
 *              There is no "price" to track at all — only a consumption curve.
 *
 * The discriminator is *sustain*, not magnitude: a hike holds its new level,
 * seasonality does not.
 */

import type { PriceChange } from '../types';
import { percentDelta, type Kurus } from '../utils/money';
import { clusterSequential, coefficientOfVariation, median } from '../utils/stats';

/** Amounts within this band of the running level belong to the same price. */
const CLUSTER_TOLERANCE = 0.05;

/** Below this, a level change is FX noise rather than a repricing. */
const MIN_STEP_PERCENT = 6.5;

/** A new level seen this many times is "sustained" — except for the latest. */
const SUSTAIN_CHARGES = 2;

/** Above this coefficient of variation a stream is consumption, not a price. */
const VARIABLE_COV_THRESHOLD = 0.15;

/** More steps than one per this many charges means seasonality, not hikes. */
const CHARGES_PER_STEP_FLOOR = 4;

export type VolatilityClass = 'FIXED' | 'FX_DRIFT' | 'STEPPED' | 'VARIABLE';

export interface PriceObservation {
  bookedAt: Date;
  amount: Kurus;
}

export interface PriceAnalysis {
  currentAmount: Kurus;
  /** Median of the most recent price level — immune to a one-off pro-rata. */
  representativeAmount: Kurus;
  changes: PriceChange[];
  coefficientOfVariation: number;
  volatilityClass: VolatilityClass;
  isVariableBill: boolean;
  /** Total extra lira paid because of every hike, over the whole history. */
  totalHikeCost: Kurus;
  /** Cumulative percentage increase from the first level to the current one. */
  cumulativeIncreasePercent: number;
}

export interface AnalyzePriceOptions {
  /** Dictionary hint: this merchant is known to bill a variable amount. */
  merchantIsVariable?: boolean;
}

export function analyzePriceHistory(
  observations: PriceObservation[],
  options: AnalyzePriceOptions = {},
): PriceAnalysis {
  const sorted = [...observations].sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime());
  const amounts = sorted.map((observation) => observation.amount);

  if (amounts.length === 0) {
    return {
      currentAmount: 0,
      representativeAmount: 0,
      changes: [],
      coefficientOfVariation: 0,
      volatilityClass: 'FIXED',
      isVariableBill: false,
      totalHikeCost: 0,
      cumulativeIncreasePercent: 0,
    };
  }

  const cov = coefficientOfVariation(amounts);
  const rawClusters = clusterSequential(amounts, CLUSTER_TOLERANCE);

  /**
   * Merge transient clusters back into their predecessor.
   *
   * A single off-level charge (a pro-rata top-up, a partial refund re-bill) is
   * not a repricing. The exception is the *final* cluster: a hike that landed
   * last month has only been seen once and must still be reported.
   */
  const merged: Array<{ center: number; startIndex: number; endIndex: number; size: number }> = [];

  rawClusters.forEach((cluster, index) => {
    const isLast = index === rawClusters.length - 1;
    const previous = merged[merged.length - 1];
    const sustained = cluster.values.length >= SUSTAIN_CHARGES;
    const bigEnough =
      !previous || Math.abs(percentDelta(previous.center, cluster.center)) >= MIN_STEP_PERCENT;

    if (previous && (!sustained && !isLast)) {
      // Absorb: extend the previous level over this blip.
      previous.endIndex = cluster.endIndex;
      previous.size += cluster.values.length;
      return;
    }
    if (previous && !bigEnough) {
      previous.endIndex = cluster.endIndex;
      previous.size += cluster.values.length;
      return;
    }
    merged.push({
      center: cluster.center,
      startIndex: cluster.startIndex,
      endIndex: cluster.endIndex,
      size: cluster.values.length,
    });
  });

  const stepCount = Math.max(0, merged.length - 1);
  const looksSeasonal =
    cov > VARIABLE_COV_THRESHOLD &&
    stepCount > Math.max(1, Math.floor(amounts.length / CHARGES_PER_STEP_FLOOR));

  const isVariableBill = Boolean(options.merchantIsVariable) || looksSeasonal;

  // ---------------------------------------------------------------------------
  //  Variable bills: report the shape, not a price ladder.
  // ---------------------------------------------------------------------------
  if (isVariableBill) {
    const recent = amounts.slice(-6);
    return {
      currentAmount: amounts[amounts.length - 1]!,
      representativeAmount: Math.round(median(recent)),
      changes: [],
      coefficientOfVariation: cov,
      volatilityClass: 'VARIABLE',
      isVariableBill: true,
      totalHikeCost: 0,
      cumulativeIncreasePercent: 0,
    };
  }

  // ---------------------------------------------------------------------------
  //  Fixed-price streams: build the step ladder.
  // ---------------------------------------------------------------------------
  const changes: PriceChange[] = [];
  let totalHikeCost = 0;

  for (let i = 1; i < merged.length; i++) {
    const previous = merged[i - 1]!;
    const current = merged[i]!;
    const previousAmount = Math.round(previous.center);
    const newAmount = Math.round(current.center);
    const deltaAmount = newAmount - previousAmount;
    const deltaPercent = percentDelta(previousAmount, newAmount);

    // Charges billed at the new level so far — the hike's realised cost.
    const chargesSinceHike = current.endIndex - current.startIndex + 1;
    const extraPaidToDate = deltaAmount * chargesSinceHike;
    if (deltaAmount > 0) totalHikeCost += extraPaidToDate;

    changes.push({
      previousAmount,
      newAmount,
      deltaAmount,
      deltaPercent,
      effectiveAt: sorted[current.startIndex]!.bookedAt,
      extraPaidToDate,
      isDecrease: deltaAmount < 0,
    });
  }

  const lastLevel = merged[merged.length - 1]!;
  const firstLevel = merged[0]!;
  const representativeAmount = Math.round(lastLevel.center);

  let volatilityClass: VolatilityClass;
  if (changes.length > 0) volatilityClass = 'STEPPED';
  else if (cov >= 0.008) volatilityClass = 'FX_DRIFT';
  else volatilityClass = 'FIXED';

  return {
    currentAmount: amounts[amounts.length - 1]!,
    representativeAmount,
    changes,
    coefficientOfVariation: cov,
    volatilityClass,
    isVariableBill: false,
    totalHikeCost,
    cumulativeIncreasePercent: percentDelta(
      Math.round(firstLevel.center),
      Math.round(lastLevel.center),
    ),
  };
}
