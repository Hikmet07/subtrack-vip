/**
 * Realistic multi-bank statement generator.
 *
 * Produces a deterministic 24-month ledger across several institutions that
 * exercises every branch of the detection engine:
 *
 *   * fixed monthly / quarterly / annual subscriptions
 *   * price hikes mid-stream (Spotify 59,99 -> 99,99)
 *   * FX-linked lira amounts that wobble every month without being a hike
 *   * severely seasonal utility bills (İGDAŞ: ₺60 in July, ₺2.400 in January)
 *   * a card migration — the same subscription moving between two banks
 *   * a double charge followed by a refund
 *   * a lapsed subscription that simply stops
 *   * a stream with exactly three charges (the minimum classifiable)
 *   * several hundred lines of retail noise that must be discarded
 *
 * It also emits **ground truth**, which lets the demo script score the engine's
 * precision and recall rather than just printing something plausible.
 */

import type {
  BankAccount,
  BillingChannel,
  EngagementSignal,
  ProviderTransaction,
  SubscriptionCategory,
  TransactionDirection,
} from '../../types';
import { addDays, addMonthsClamped, atNoonUTC, daysInMonth, monthKey } from '../../utils/date';
import { lira, type Kurus } from '../../utils/money';
import { clamp } from '../../utils/stats';
import { SeededRandom } from '../../utils/rng';
import {
  MOCK_MERCHANTS,
  TURKISH_CITIES,
  type MockMerchantProfile,
} from './merchant-catalog';

export interface GroundTruthStream {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  kind: 'SUBSCRIPTION' | 'VARIABLE_BILL' | 'NOISE';
  /**
   * Billing rail. Products on APPLE_IAP / GOOGLE_PLAY hide behind an opaque
   * aggregator descriptor, so the scorecard grades them as "detected but
   * unnamed" rather than as a miss.
   */
  channel: BillingChannel;
  expectedDetectable: boolean;
  chargeCount: number;
  lastAmount: Kurus;
  note?: string;
}

export interface GeneratedLedger {
  transactions: ProviderTransaction[];
  engagementSignals: EngagementSignal[];
  groundTruth: GroundTruthStream[];
}

export interface GenerateLedgerOptions {
  seed: string | number;
  accounts: BankAccount[];
  /** Reference "today". Everything is generated backwards from here. */
  now: Date;
  historyMonths?: number;
  /** Include salary/transfer credits. Off for focused engine tests. */
  includeIncome?: boolean;
}

interface AccountBuckets {
  creditCards: BankAccount[];
  checking: BankAccount[];
  prepaid: BankAccount[];
  all: BankAccount[];
}

// -----------------------------------------------------------------------------
//  Descriptor rendering
// -----------------------------------------------------------------------------

function renderDescriptor(template: string, rng: SeededRandom): string {
  return template
    .replace('{ref}', String(rng.int(100_000, 9_999_999)))
    .replace('{short}', String(rng.int(1000, 9999)))
    .replace('{terminal}', `TR${rng.int(100_000, 999_999)}`)
    .replace('{city}', rng.pick(TURKISH_CITIES));
}

// -----------------------------------------------------------------------------
//  Pricing
// -----------------------------------------------------------------------------

/**
 * Resolves the price in force `monthsAgo` months before today.
 * Price points are declared newest-first-agnostic, so we sort oldest-first and
 * take the last step that had already taken effect.
 */
function priceAt(profile: MockMerchantProfile, monthsAgo: number): Kurus {
  const history = [...(profile.priceHistory ?? [])].sort((a, b) => b.monthsAgo - a.monthsAgo);
  if (history.length === 0) return lira(0);
  let price = history[0]!.amount;
  for (const point of history) {
    if (point.monthsAgo >= monthsAgo) price = point.amount;
  }
  return price;
}

/**
 * FX wobble for USD/EUR-denominated services billed in lira.
 *
 * Kept inside ±3.5% so it stays *below* the price-step threshold: this is the
 * exact noise band a naive detector would misreport as a monthly price hike.
 */
function applyFxDrift(amount: Kurus, monthsAgo: number, rng: SeededRandom): Kurus {
  const cyclical = Math.sin(monthsAgo / 2.7) * 0.014;
  const jitter = clamp(rng.gaussian(0, 0.011), -0.02, 0.02);
  return Math.round(amount * (1 + cyclical + jitter));
}

/**
 * Seasonal + inflationary model for utility and telecom bills.
 * The floor prevents a large amplitude from producing a negative bill; real
 * gas bills bottom out at the standing charge, not at zero.
 */
function variableBillAmount(
  profile: MockMerchantProfile,
  chargeDate: Date,
  monthsAgo: number,
  rng: SeededRandom,
): Kurus {
  const v = profile.variable!;
  // Older bills were cheaper: discount the base by compounded inflation.
  const inflationFactor = Math.pow(1 + v.annualInflation, -monthsAgo / 12);
  const phase = ((chargeDate.getUTCMonth() - v.peakMonthIndex) / 12) * 2 * Math.PI;
  const seasonal = v.seasonalAmplitude * Math.cos(phase);
  const noise = 1 + clamp(rng.gaussian(0, v.noiseRatio / 2), -v.noiseRatio, v.noiseRatio);
  const raw = (v.baseAmount + seasonal) * inflationFactor * noise;
  const floor = v.baseAmount * inflationFactor * 0.08;
  return Math.round(Math.max(floor, raw));
}

// -----------------------------------------------------------------------------
//  Scheduling
// -----------------------------------------------------------------------------

const CYCLE_MONTHS: Record<string, number> = {
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/**
 * Places a charge inside its billing month.
 *
 * Real charge dates are not metronomic: settlement drifts a day or two, and a
 * standing order that falls on a Sunday is executed on the Monday. This jitter
 * is what makes the observed interval land in 28–34 days rather than exactly
 * 30, and is precisely what the periodicity matrix is built to tolerate.
 */
function scheduleChargeDate(
  monthAnchor: Date,
  anchorDay: number,
  rng: SeededRandom,
  isStandingOrder: boolean,
): Date {
  const year = monthAnchor.getUTCFullYear();
  const monthIndex = monthAnchor.getUTCMonth();
  const clampedDay = Math.min(anchorDay, daysInMonth(year, monthIndex));
  let date = new Date(Date.UTC(year, monthIndex, clampedDay, 12, 0, 0, 0));

  const jitter = Math.round(clamp(rng.gaussian(0, 0.9), -3, 3));
  date = addDays(date, jitter);

  if (isStandingOrder) {
    const dow = date.getUTCDay();
    if (dow === 0) date = addDays(date, 1); // Pazar -> Pazartesi
    if (dow === 6) date = addDays(date, 2); // Cumartesi -> Pazartesi
  }
  return atNoonUTC(date);
}

// -----------------------------------------------------------------------------
//  Account routing
// -----------------------------------------------------------------------------

function bucketAccounts(accounts: BankAccount[]): AccountBuckets {
  return {
    creditCards: accounts.filter((a) => a.accountType === 'CREDIT_CARD'),
    checking: accounts.filter((a) => a.accountType === 'CHECKING'),
    prepaid: accounts.filter((a) => a.accountType === 'PREPAID'),
    all: accounts,
  };
}

/**
 * Routes a merchant to a plausible funding account.
 * Standing orders and carrier billing must sit on a current account — Turkish
 * banks will not attach an "otomatik ödeme talimatı" to a credit card.
 */
function routeAccount(
  profile: MockMerchantProfile,
  buckets: AccountBuckets,
  rng: SeededRandom,
): BankAccount {
  if (profile.channel === 'BANK_STANDING_ORDER' || profile.channel === 'CARRIER_BILLING') {
    return buckets.checking[0] ?? buckets.all[0]!;
  }
  const cardPool = buckets.creditCards.length > 0 ? buckets.creditCards : buckets.all;
  return rng.pick(cardPool);
}

// -----------------------------------------------------------------------------
//  Generator
// -----------------------------------------------------------------------------

export function generateLedger(options: GenerateLedgerOptions): GeneratedLedger {
  const { seed, accounts, now } = options;
  const historyMonths = options.historyMonths ?? 24;
  const includeIncome = options.includeIncome ?? true;

  const rng = new SeededRandom(seed);
  const buckets = bucketAccounts(accounts);
  const transactions: ProviderTransaction[] = [];
  const engagementSignals: EngagementSignal[] = [];
  const groundTruth: GroundTruthStream[] = [];
  const sequence = new Map<string, number>();

  const push = (
    account: BankAccount,
    bookedAt: Date,
    amount: Kurus,
    rawDescriptor: string,
    direction: TransactionDirection = 'DEBIT',
    metadata?: Record<string, unknown>,
  ): void => {
    if (bookedAt.getTime() > now.getTime()) return; // never book the future
    const dayKey = `${account.id}-${monthKey(bookedAt)}`;
    const seq = (sequence.get(dayKey) ?? 0) + 1;
    sequence.set(dayKey, seq);
    transactions.push({
      providerTxnRef: `MCK-${account.providerAccountRef}-${bookedAt.getUTCFullYear()}${String(
        bookedAt.getUTCMonth() + 1,
      ).padStart(2, '0')}${String(bookedAt.getUTCDate()).padStart(2, '0')}-${String(seq).padStart(3, '0')}`,
      accountId: account.id,
      bookedAt,
      valueDate: bookedAt,
      amount,
      currency: 'TRY',
      direction,
      rawDescriptor,
      providerMetadata: metadata,
    });
  };

  // ---------------------------------------------------------------------------
  //  Recurring subscriptions & variable bills
  // ---------------------------------------------------------------------------

  for (const profile of MOCK_MERCHANTS) {
    if (profile.kind === 'NOISE') continue;

    const cycleMonths = CYCLE_MONTHS[profile.cycle ?? 'MONTHLY'] ?? 1;
    const startedMonthsAgo = Math.min(profile.startedMonthsAgo ?? historyMonths, historyMonths);
    const endedMonthsAgo = profile.endedMonthsAgo ?? 0;
    const homeAccount = routeAccount(profile, buckets, rng);

    /**
     * Card migration: Netflix moves to a different bank part-way through, which
     * is how real people behave when a card expires. The engine groups by
     * merchant, not by account, so this must not split into two subscriptions.
     */
    const migratesAt = profile.key === 'netflix' ? 7 : null;
    const migrationTarget =
      migratesAt !== null
        ? buckets.creditCards.find((a) => a.id !== homeAccount.id) ?? homeAccount
        : homeAccount;

    /**
     * A merchant's acquirer emits the *same* descriptor format month after
     * month, varying only the reference number. Rotating templates randomly per
     * charge would be an unrealistically hostile test — and would wrongly split
     * one stream across several merchant keys. Pick one primary format and use
     * an alternate only occasionally, which is what a real acquirer migration
     * or a fallback rail looks like.
     */
    const primaryTemplate = rng.pick(profile.descriptors);

    let chargeCount = 0;
    let lastAmount: Kurus = 0;

    for (let monthsAgo = startedMonthsAgo; monthsAgo >= endedMonthsAgo; monthsAgo -= cycleMonths) {
      if (profile.skipProbability && rng.bool(profile.skipProbability)) continue;

      const monthAnchor = addMonthsClamped(now, -monthsAgo);
      const isStandingOrder =
        profile.channel === 'BANK_STANDING_ORDER' || profile.channel === 'CARRIER_BILLING';
      const chargeDate = scheduleChargeDate(
        monthAnchor,
        profile.anchorDay ?? 15,
        rng,
        isStandingOrder,
      );
      if (chargeDate.getTime() > now.getTime()) continue;

      let amount: Kurus;
      if (profile.kind === 'VARIABLE_BILL') {
        amount = variableBillAmount(profile, chargeDate, monthsAgo, rng);
      } else {
        amount = priceAt(profile, monthsAgo);
        if (profile.fxLinked) amount = applyFxDrift(amount, monthsAgo, rng);
      }

      const account =
        migratesAt !== null && monthsAgo <= migratesAt ? migrationTarget : homeAccount;
      const template = rng.bool(0.88) ? primaryTemplate : rng.pick(profile.descriptors);
      const descriptor = renderDescriptor(template, rng);

      push(account, chargeDate, amount, descriptor, 'DEBIT', {
        simulated: true,
        merchantKey: profile.key,
      });
      chargeCount++;
      lastAmount = amount;

      /**
       * Double charge + refund, once, on Netflix. Banks do this when a
       * settlement is retried. The median-based interval and amount statistics
       * must absorb it without inventing a second subscription.
       */
      if (profile.key === 'netflix' && monthsAgo === 13) {
        const duplicate = addDays(chargeDate, 1);
        push(account, duplicate, amount, descriptor, 'DEBIT', { simulated: true, duplicate: true });
        push(account, addDays(chargeDate, 4), amount, `IADE - ${descriptor}`, 'CREDIT', {
          simulated: true,
          refund: true,
        });
        chargeCount++;
      }
    }

    if (profile.engagement) {
      engagementSignals.push({
        merchantKey: profile.key,
        lastInteractionAt:
          profile.engagement.lastInteractionMonthsAgo === null
            ? undefined
            : addMonthsClamped(now, -profile.engagement.lastInteractionMonthsAgo),
        interactionsLast30d: profile.engagement.interactionsLast30d,
        source: 'USER_DECLARED',
      });
    }

    groundTruth.push({
      merchantKey: profile.key,
      merchantName: profile.name,
      category: profile.category,
      kind: profile.kind,
      channel: profile.channel,
      // Three charges is the floor: two consecutive intervals are required.
      expectedDetectable: chargeCount >= 3,
      chargeCount,
      lastAmount,
      note:
        profile.endedMonthsAgo && profile.endedMonthsAgo > 0
          ? `${profile.endedMonthsAgo} ay önce durdu (LAPSED beklenir)`
          : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  //  Retail noise
  // ---------------------------------------------------------------------------

  const noiseAccounts = [...buckets.creditCards, ...buckets.prepaid, ...buckets.checking];

  for (const profile of MOCK_MERCHANTS) {
    if (profile.kind !== 'NOISE' || !profile.noise) continue;
    const cfg = profile.noise;
    let count = 0;

    for (let monthsAgo = historyMonths; monthsAgo >= 0; monthsAgo--) {
      const monthAnchor = addMonthsClamped(now, -monthsAgo);
      const occurrences = rng.int(cfg.perMonth[0], cfg.perMonth[1]);

      for (let i = 0; i < occurrences; i++) {
        const dim = daysInMonth(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth());
        let day = rng.int(1, dim);
        // Nudge leisure spend towards the weekend.
        if (cfg.weekendBias && rng.bool(cfg.weekendBias)) {
          const probe = new Date(
            Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), day, 12),
          );
          const toSaturday = (6 - probe.getUTCDay() + 7) % 7;
          day = Math.min(dim, day + toSaturday);
        }
        const date = atNoonUTC(
          new Date(Date.UTC(monthAnchor.getUTCFullYear(), monthAnchor.getUTCMonth(), day, 12)),
        );
        if (date.getTime() > now.getTime()) continue;

        // Log-uniform: most retail baskets are small, a few are very large.
        const logMin = Math.log(cfg.minAmount);
        const logMax = Math.log(cfg.maxAmount);
        const amount = Math.round(Math.exp(rng.float(logMin, logMax)));

        push(
          rng.pick(noiseAccounts),
          date,
          amount,
          renderDescriptor(rng.pick(profile.descriptors), rng),
          'DEBIT',
          { simulated: true, noise: true },
        );
        count++;
      }
    }

    groundTruth.push({
      merchantKey: profile.key,
      merchantName: profile.name,
      category: profile.category,
      kind: 'NOISE',
      channel: profile.channel,
      expectedDetectable: false,
      chargeCount: count,
      lastAmount: 0,
      note: 'Gürültü — abonelik olarak sınıflandırılmamalı',
    });
  }

  // ---------------------------------------------------------------------------
  //  Income — keeps the account balances and the burn-rate context believable
  // ---------------------------------------------------------------------------

  if (includeIncome && buckets.checking.length > 0) {
    const salaryAccount = buckets.checking[0]!;
    let salary = lira(78_500);
    for (let monthsAgo = historyMonths; monthsAgo >= 0; monthsAgo--) {
      const monthAnchor = addMonthsClamped(now, -monthsAgo);
      const payday = scheduleChargeDate(monthAnchor, 15, rng, true);
      if (payday.getTime() > now.getTime()) continue;
      push(salaryAccount, payday, salary, 'MAAS ODEMESI - ORNEK YAZILIM A.S.', 'CREDIT', {
        simulated: true,
        income: true,
      });
      // Two raises a year, roughly tracking inflation.
      if (monthsAgo % 6 === 0) salary = Math.round(salary * 1.14);
    }
  }

  transactions.sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime());
  return { transactions, engagementSignals, groundTruth };
}
