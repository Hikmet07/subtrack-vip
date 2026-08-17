/**
 * The Smart Subscription Detection Engine.
 *
 * Pipeline:
 *
 *   raw statement lines
 *        │
 *        ├─ 1. filter    debits only; credits are refunds and salary
 *        ├─ 2. normalise descriptor -> merchant identity + billing channel
 *        ├─ 3. group     by merchant, splitting aggregator rails (Apple/Google)
 *        ├─ 4. periodicity   >=2 consecutive matching intervals, else reject
 *        ├─ 5. price      fixed / FX-drift / stepped / variable classification
 *        ├─ 6. score      detection confidence + forgotten-risk
 *        ├─ 7. predict    next renewal date with a stated tolerance window
 *        └─ 8. alert      renewals, hikes, zombies, duplicate categories
 *
 * The engine is pure: same input, same output, no I/O, no clock access beyond
 * the injected `now`. That is what makes it testable and what lets the same
 * code run in a request handler, a nightly worker or a `tsx` script.
 */

import type {
  Alert,
  AlertKind,
  BillingChannel,
  DetectedSubscription,
  DetectionResult,
  DetectionSnapshot,
  EngagementSignal,
  EnrichedTransaction,
  ProviderTransaction,
  SubscriptionCategory,
  SubscriptionCharge,
  SubscriptionState,
} from '../types';
import { addDays, daysBetween, formatDateTR } from '../utils/date';
import {
  annualEquivalent,
  formatPercentTR,
  formatTRY,
  monthlyEquivalent,
  sumKurus,
  type Kurus,
} from '../utils/money';
import { clamp, normalize } from '../utils/stats';
import { CATEGORY_LABELS_TR } from '../i18n/tr';
import { normalizeMerchant, type MerchantOverrideRule } from './normalization';
import { analyzePeriodicity, splitAggregatorStream } from './periodicity';
import { analyzePriceHistory, type PriceAnalysis } from './price-drift';
import { assessForgottenRisk } from './risk-engine';
import { predictNextRenewal } from './renewal-predictor';

export const ENGINE_VERSION = '1.4.0';

export interface DetectionConfig {
  /** Minimum confidence for ACTIVE. Below this a stream is a CANDIDATE. */
  confidenceThreshold: number;
  /** Days before a predicted renewal at which to raise an alert. */
  renewalLeadDays: number;
  /**
   * Forgotten-risk score at which a zombie alert is raised.
   *
   * Pinned to the HIGH risk band (50) on purpose: the savings KPI counts every
   * HIGH/CRITICAL subscription as "unutulmuş", and a higher alert threshold
   * would have the dashboard claim five forgotten subscriptions while the alert
   * panel showed none of them.
   */
  zombieAlertThreshold: number;
  /** Subscriptions in one category before a duplicate-service alert fires. */
  duplicateCategoryThreshold: number;
  /** Only hikes inside this window feed the Price Hike Radar. */
  priceHikeLookbackMonths: number;
  /** Streams cheaper than this are ignored — bank fees, FX rounding. */
  minMonthlyAmount: Kurus;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  confidenceThreshold: 0.62,
  renewalLeadDays: 3,
  zombieAlertThreshold: 50,
  duplicateCategoryThreshold: 3,
  priceHikeLookbackMonths: 12,
  minMonthlyAmount: 1000, // ₺10,00
};

export interface DetectionInput {
  transactions: ProviderTransaction[];
  engagementSignals?: EngagementSignal[];
  merchantOverrides?: MerchantOverrideRule[];
  /** Merchants the user has explicitly dismissed. */
  ignoredMerchantKeys?: string[];
  now: Date;
  config?: Partial<DetectionConfig>;
}

/** Confidence weights. Must sum to 1. */
const CONFIDENCE_WEIGHTS = {
  merchant: 0.2,
  regularity: 0.25,
  amountStability: 0.2,
  occurrences: 0.2,
  anchorAdherence: 0.15,
} as const;

interface StreamBucket {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  channel: BillingChannel;
  merchantConfidence: number;
  isAggregator: boolean;
  variableAmountHint: boolean;
  /** This bucket is one product carved out of an aggregator rail. */
  isAggregatorSplit: boolean;
  transactions: EnrichedTransaction[];
}

// -----------------------------------------------------------------------------
//  Entry point
// -----------------------------------------------------------------------------

export function detectSubscriptions(input: DetectionInput): DetectionResult {
  const config = { ...DEFAULT_DETECTION_CONFIG, ...input.config };
  const now = input.now;
  const ignored = new Set(input.ignoredMerchantKeys ?? []);
  const engagementByKey = new Map(
    (input.engagementSignals ?? []).map((signal) => [signal.merchantKey, signal]),
  );

  // --- 1 & 2. Filter and normalise -------------------------------------------
  const enriched: EnrichedTransaction[] = [];
  let noiseFiltered = 0;

  for (const txn of input.transactions) {
    // Credits are refunds, salary and transfers. A subscription is a debit.
    if (txn.direction !== 'DEBIT') continue;

    const merchant = normalizeMerchant(txn.rawDescriptor, input.merchantOverrides);
    const enrichedTxn: EnrichedTransaction = {
      ...txn,
      normalizedMerchant: merchant.merchantName,
      merchantKey: merchant.merchantKey,
      category: merchant.category,
      detectedChannel: merchant.channel,
      merchantConfidence: merchant.confidence,
      matchStrategy: merchant.strategy,
      isNoise: merchant.isNoise,
    };

    if (merchant.isNoise || ignored.has(merchant.merchantKey)) {
      noiseFiltered++;
      continue;
    }
    enriched.push(enrichedTxn);
  }

  // --- 3. Group into candidate streams ---------------------------------------
  const buckets = groupIntoStreams(enriched, input.merchantOverrides);

  // --- 4-7. Analyse each stream ----------------------------------------------
  const analysed: DetectedSubscription[] = [];

  for (const bucket of buckets) {
    const subscription = analyseStream(bucket, now, config);
    if (subscription) analysed.push(subscription);
  }

  // Risk scoring needs the whole portfolio (cost share, category overlap), so
  // it runs as a second pass once every stream's monthly cost is known.
  applyPortfolioRiskScoring(analysed, engagementByKey, now);

  const subscriptions = analysed
    .filter((subscription) => subscription.state !== 'CANDIDATE')
    .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

  const candidates = analysed
    .filter((subscription) => subscription.state === 'CANDIDATE')
    .sort((a, b) => b.detectionConfidence - a.detectionConfidence);

  // --- 8. Alerts --------------------------------------------------------------
  const alerts = buildAlerts(subscriptions, now, config);

  return {
    engineVersion: ENGINE_VERSION,
    runAt: now,
    transactionsScanned: input.transactions.length,
    noiseFiltered,
    subscriptions,
    candidates,
    alerts,
  };
}

// -----------------------------------------------------------------------------
//  Grouping
// -----------------------------------------------------------------------------

function groupIntoStreams(
  transactions: EnrichedTransaction[],
  overrides?: MerchantOverrideRule[],
): StreamBucket[] {
  const byKey = new Map<string, EnrichedTransaction[]>();
  for (const txn of transactions) {
    const existing = byKey.get(txn.merchantKey);
    if (existing) existing.push(txn);
    else byKey.set(txn.merchantKey, [txn]);
  }

  const buckets: StreamBucket[] = [];

  for (const [merchantKey, txns] of byKey) {
    // Re-normalise one descriptor to recover the merchant's static metadata
    // (aggregator flag, variable-amount hint) without threading it through the
    // whole transaction array.
    const meta = normalizeMerchant(txns[0]!.rawDescriptor, overrides);
    const base = {
      merchantKey,
      merchantName: txns[0]!.normalizedMerchant,
      category: txns[0]!.category,
      channel: dominantChannel(txns),
      merchantConfidence: meta.confidence,
      isAggregator: meta.isAggregator,
      variableAmountHint: meta.variableAmount,
    };

    if (!meta.isAggregator) {
      buckets.push({ ...base, isAggregatorSplit: false, transactions: txns });
      continue;
    }

    /**
     * Aggregator rails carry many products under one descriptor. Split them by
     * billing anniversary — Apple charges each subscription on its own day of
     * the month, so the anchor day is the only usable discriminator.
     */
    const groups = splitAggregatorStream(
      txns.map((txn) => ({ item: txn, bookedAt: txn.bookedAt })),
    );

    for (const group of groups) {
      if (group.items.length < 3) continue; // too thin to classify
      buckets.push({
        ...base,
        merchantKey: `${merchantKey}::${group.discriminator}`,
        merchantName: `${base.merchantName} · her ayın ${group.anchorDay}'i`,
        isAggregatorSplit: true,
        transactions: group.items,
      });
    }
  }

  return buckets;
}

/** The channel seen most often; ties break towards the most recent charge. */
function dominantChannel(transactions: EnrichedTransaction[]): BillingChannel {
  const counts = new Map<BillingChannel, number>();
  for (const txn of transactions) {
    counts.set(txn.detectedChannel, (counts.get(txn.detectedChannel) ?? 0) + 1);
  }
  let best: BillingChannel = 'UNKNOWN';
  let bestCount = -1;
  for (const [channel, count] of counts) {
    if (channel !== 'UNKNOWN' && count > bestCount) {
      best = channel;
      bestCount = count;
    }
  }
  return best;
}

// -----------------------------------------------------------------------------
//  Per-stream analysis
// -----------------------------------------------------------------------------

function analyseStream(
  bucket: StreamBucket,
  now: Date,
  config: DetectionConfig,
): DetectedSubscription | null {
  const txns = [...bucket.transactions].sort(
    (a, b) => a.bookedAt.getTime() - b.bookedAt.getTime(),
  );
  if (txns.length < 3) return null;

  // --- 4. Periodicity ---------------------------------------------------------
  const periodicity = analyzePeriodicity(txns.map((txn) => txn.bookedAt));
  if (!periodicity.isRecurring) return null;

  // --- 5. Price ---------------------------------------------------------------
  const price = analyzePriceHistory(
    txns.map((txn) => ({ bookedAt: txn.bookedAt, amount: txn.amount })),
    { merchantIsVariable: bucket.variableAmountHint },
  );

  const representative = price.representativeAmount;
  const monthly = monthlyEquivalent(representative, periodicity.cycleDays);
  if (monthly < config.minMonthlyAmount) return null;

  // --- 6. Confidence ----------------------------------------------------------
  const amountStability = amountStabilityScore(price);
  const occurrenceScore = normalize(txns.length, 3, 9);

  const confidenceBreakdown = {
    merchant: bucket.merchantConfidence * CONFIDENCE_WEIGHTS.merchant,
    regularity: periodicity.regularity * CONFIDENCE_WEIGHTS.regularity,
    amountStability: amountStability * CONFIDENCE_WEIGHTS.amountStability,
    occurrences: occurrenceScore * CONFIDENCE_WEIGHTS.occurrences,
    anchorAdherence: periodicity.anchorAdherence * CONFIDENCE_WEIGHTS.anchorAdherence,
  };
  const confidence = clamp(
    Object.values(confidenceBreakdown).reduce((a, b) => a + b, 0),
    0,
    1,
  );

  // --- 7. Renewal -------------------------------------------------------------
  const lastChargedAt = txns[txns.length - 1]!.bookedAt;
  const renewal = predictNextRenewal({
    lastChargedAt,
    cycleDays: periodicity.cycleDays,
    cycle: periodicity.cycle,
    anchorDayOfMonth: periodicity.anchorDayOfMonth,
    regularity: periodicity.regularity,
    now,
  });

  const state = classifyState(confidence, config, price, renewal.hasLapsed);

  const snapshot: DetectionSnapshot = {
    engineVersion: ENGINE_VERSION,
    intervalsDays: periodicity.intervals,
    medianIntervalDays: periodicity.medianIntervalDays,
    intervalRegularity: periodicity.regularity,
    amountCoefficientOfVariation: price.coefficientOfVariation,
    anchorDayOfMonth: periodicity.anchorDayOfMonth,
    anchorAdherence: periodicity.anchorAdherence,
    missedPeriods: periodicity.missedPeriods,
    confidenceBreakdown,
  };

  const charges: SubscriptionCharge[] = txns.map((txn) => ({
    transactionRef: txn.providerTxnRef,
    accountId: txn.accountId,
    bookedAt: txn.bookedAt,
    amount: txn.amount,
    rawDescriptor: txn.rawDescriptor,
  }));

  const involvedAccountIds = [...new Set(txns.map((txn) => txn.accountId))];

  return {
    merchantKey: bucket.merchantKey,
    merchantName: bucket.merchantName,
    category: bucket.category,
    billingChannel: bucket.channel,
    primaryAccountId: txns[txns.length - 1]!.accountId,
    involvedAccountIds,

    state,
    billingCycle: periodicity.cycle,
    cycleDays: periodicity.cycleDays,

    currentAmount: representative,
    monthlyEquivalent: monthly,
    annualEquivalent: annualEquivalent(representative, periodicity.cycleDays),
    currency: txns[0]!.currency,

    firstChargedAt: txns[0]!.bookedAt,
    lastChargedAt,
    occurrences: txns.length,
    totalPaid: sumKurus(txns.map((txn) => txn.amount)),

    nextRenewalAt: renewal.nextRenewalAt,
    renewalWindowDays: renewal.windowDays,

    detectionConfidence: confidence,
    // Filled in by the portfolio pass.
    forgottenRiskScore: 0,
    riskBand: 'LOW',
    riskFactors: [],

    isAggregatorSplit: bucket.isAggregatorSplit,
    needsUserLabel: bucket.isAggregatorSplit,

    priceChanges: price.changes,
    charges,
    snapshot,
  };
}

/**
 * How much the amount signal supports "this is a subscription".
 * A variable utility bill still scores well — it *is* recurring, it just has no
 * fixed price — but slightly below a rock-steady fixed charge.
 */
function amountStabilityScore(price: PriceAnalysis): number {
  switch (price.volatilityClass) {
    case 'FIXED':
      return 1;
    case 'FX_DRIFT':
      return 0.95;
    case 'STEPPED':
      return 0.88;
    case 'VARIABLE':
      return 0.7;
  }
}

function classifyState(
  confidence: number,
  config: DetectionConfig,
  price: PriceAnalysis,
  hasLapsed: boolean,
): SubscriptionState {
  if (confidence < config.confidenceThreshold) return 'CANDIDATE';
  if (hasLapsed) return 'LAPSED';
  if (price.isVariableBill) return 'VARIABLE_BILL';
  return 'ACTIVE';
}

// -----------------------------------------------------------------------------
//  Portfolio-level risk scoring
// -----------------------------------------------------------------------------

function applyPortfolioRiskScoring(
  subscriptions: DetectedSubscription[],
  engagementByKey: Map<string, EngagementSignal>,
  now: Date,
): void {
  const live = subscriptions.filter(
    (subscription) => subscription.state === 'ACTIVE' || subscription.state === 'VARIABLE_BILL',
  );
  const totalMonthlyBurn = sumKurus(live.map((subscription) => subscription.monthlyEquivalent));

  const categoryCounts = new Map<SubscriptionCategory, number>();
  for (const subscription of live) {
    categoryCounts.set(
      subscription.category,
      (categoryCounts.get(subscription.category) ?? 0) + 1,
    );
  }

  for (const subscription of subscriptions) {
    // Utility bills cannot be "forgotten" — you cannot cancel electricity.
    if (subscription.state === 'VARIABLE_BILL') {
      subscription.forgottenRiskScore = 0;
      subscription.riskBand = 'LOW';
      subscription.riskFactors = [];
      continue;
    }

    const cumulativeIncrease = subscription.priceChanges.reduce(
      (acc, change) => acc + change.deltaPercent,
      0,
    );

    // Aggregator sub-streams key on "apple::d08"; engagement is keyed on the
    // base merchant, so fall back to the prefix.
    const baseKey = subscription.merchantKey.split('::')[0]!;
    const engagement =
      engagementByKey.get(subscription.merchantKey) ?? engagementByKey.get(baseKey);

    const assessment = assessForgottenRisk({
      merchantKey: subscription.merchantKey,
      merchantName: subscription.merchantName,
      category: subscription.category,
      monthlyEquivalent: subscription.monthlyEquivalent,
      cycleDays: subscription.cycleDays,
      occurrences: subscription.occurrences,
      firstChargedAt: subscription.firstChargedAt,
      lastChargedAt: subscription.lastChargedAt,
      cumulativeIncreasePercent: cumulativeIncrease,
      engagement,
      // An unlabelled aggregator stream has no usage signal by construction.
      engagementUnknown: subscription.needsUserLabel && !engagement,
      sameCategoryCount: Math.max(0, (categoryCounts.get(subscription.category) ?? 1) - 1),
      totalMonthlyBurn,
      now,
    });

    subscription.forgottenRiskScore = assessment.score;
    subscription.riskBand = assessment.band;
    subscription.riskFactors = assessment.factors;
  }
}

// -----------------------------------------------------------------------------
//  Alerts
// -----------------------------------------------------------------------------

function buildAlerts(
  subscriptions: DetectedSubscription[],
  now: Date,
  config: DetectionConfig,
): Alert[] {
  const alerts: Alert[] = [];
  const horizon = addDays(now, config.renewalLeadDays);
  const hikeCutoff = addDays(now, -config.priceHikeLookbackMonths * 30.44);

  for (const subscription of subscriptions) {
    // --- Upcoming renewal ----------------------------------------------------
    if (
      subscription.nextRenewalAt &&
      subscription.nextRenewalAt <= horizon &&
      subscription.state === 'ACTIVE'
    ) {
      const days = daysBetween(now, subscription.nextRenewalAt);
      alerts.push({
        kind: 'RENEWAL_UPCOMING',
        severity: 'INFO',
        title: `${subscription.merchantName} yenileniyor`,
        body:
          days <= 0
            ? `${formatTRY(subscription.currentAmount)} tutarındaki yenileme bugün gerçekleşiyor.`
            : `${days} gün içinde ${formatTRY(subscription.currentAmount)} tahsil edilecek (${formatDateTR(subscription.nextRenewalAt)}).`,
        dedupeKey: `RENEWAL_UPCOMING:${subscription.merchantKey}:${subscription.nextRenewalAt.toISOString().slice(0, 10)}`,
        merchantKey: subscription.merchantKey,
        payload: { amount: subscription.currentAmount, days },
        createdAt: now,
      });
    }

    // --- Price hike ----------------------------------------------------------
    for (const change of subscription.priceChanges) {
      if (change.isDecrease || change.effectiveAt < hikeCutoff) continue;
      alerts.push({
        kind: 'PRICE_HIKE',
        severity: change.deltaPercent >= 25 ? 'WARNING' : 'INFO',
        title: `${subscription.merchantName} zam yaptı`,
        body: `${formatTRY(change.previousAmount)} → ${formatTRY(change.newAmount)} (${formatPercentTR(change.deltaPercent)}). Bu zam bugüne kadar ${formatTRY(change.extraPaidToDate)} ek maliyet yarattı.`,
        dedupeKey: `PRICE_HIKE:${subscription.merchantKey}:${change.effectiveAt.toISOString().slice(0, 7)}`,
        merchantKey: subscription.merchantKey,
        payload: {
          previousAmount: change.previousAmount,
          newAmount: change.newAmount,
          deltaPercent: Math.round(change.deltaPercent * 10) / 10,
        },
        createdAt: now,
      });
    }

    // --- Zombie --------------------------------------------------------------
    if (
      subscription.forgottenRiskScore >= config.zombieAlertThreshold &&
      subscription.state === 'ACTIVE'
    ) {
      alerts.push({
        kind: 'ZOMBIE_SUBSCRIPTION',
        severity: subscription.forgottenRiskScore >= 75 ? 'CRITICAL' : 'WARNING',
        title: `${subscription.merchantName} unutulmuş olabilir`,
        body: `Unutulma riski ${subscription.forgottenRiskScore}/100. İptal ederseniz yılda ${formatTRY(subscription.annualEquivalent, { whole: true })} tasarruf edersiniz.`,
        dedupeKey: `ZOMBIE:${subscription.merchantKey}:${now.toISOString().slice(0, 7)}`,
        merchantKey: subscription.merchantKey,
        payload: {
          score: subscription.forgottenRiskScore,
          annualSaving: subscription.annualEquivalent,
        },
        createdAt: now,
      });
    }
  }

  // --- Duplicate services in one category ------------------------------------
  const byCategory = new Map<SubscriptionCategory, DetectedSubscription[]>();
  for (const subscription of subscriptions) {
    if (subscription.state !== 'ACTIVE') continue;
    const list = byCategory.get(subscription.category);
    if (list) list.push(subscription);
    else byCategory.set(subscription.category, [subscription]);
  }

  for (const [category, list] of byCategory) {
    if (list.length < config.duplicateCategoryThreshold) continue;
    const total = sumKurus(list.map((subscription) => subscription.monthlyEquivalent));
    alerts.push({
      kind: 'DUPLICATE_SERVICE',
      severity: 'WARNING',
      title: `${CATEGORY_LABELS_TR[category]} kategorisinde ${list.length} abonelik`,
      body: `${list.map((s) => s.merchantName).join(', ')} birlikte ayda ${formatTRY(total)} tutuyor. Büyük olasılıkla hepsine ihtiyacınız yok.`,
      dedupeKey: `DUPLICATE:${category}:${now.toISOString().slice(0, 7)}`,
      payload: { count: list.length, monthlyTotal: total },
      createdAt: now,
    });
  }

  /**
   * Rank by severity first, then by how actionable the kind is.
   *
   * Without the kind weight a user with six price hikes never sees the zombie
   * that is costing them ₺15.000 a year, because both are WARNING and the
   * hikes were generated first. Money the user can still save outranks money
   * already spent.
   */
  const severityRank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
  const kindRank: Record<AlertKind, number> = {
    ROGUE_CHARGE: 0,
    ZOMBIE_SUBSCRIPTION: 1,
    DUPLICATE_SERVICE: 2,
    PRICE_HIKE: 3,
    TRIAL_ENDING: 4,
    RENEWAL_UPCOMING: 5,
  };

  return alerts.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || kindRank[a.kind] - kindRank[b.kind],
  );
}
