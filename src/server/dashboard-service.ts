/**
 * Dashboard application service.
 *
 * Sits between the pure core and the React tree. Two responsibilities:
 *
 *   1. Orchestration — pull accounts and statements through `IBankProvider`,
 *      run detection, run analytics, resolve cancellation plans.
 *   2. Presentation shaping — hand the UI a view model of primitives with every
 *      Turkish string already formatted.
 *
 * Point 2 is deliberate. Formatting currency and dates inside components means
 * `Intl` runs on both the server and the client, and any disagreement about
 * locale data produces a hydration mismatch — on a financial dashboard that
 * shows up as numbers visibly flickering to different values on load. Format
 * once, on the server, and ship strings.
 */

import { buildDashboardAnalytics } from '@/core/analytics/dashboard';
import { buildCancellationPlan } from '@/core/cancellation/workflow';
import { detectSubscriptions, ENGINE_VERSION } from '@/core/detection/engine';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS_TR,
  CHANNEL_LABELS_TR,
  CHANNEL_SHORT_TR,
  CYCLE_LABELS_TR,
  CYCLE_SUFFIX_TR,
  RISK_BAND_LABELS_TR,
  STATE_LABELS_TR,
} from '@/core/i18n/tr';
import { getBankProvider } from '@/core/providers/registry';
import { MockBankProvider } from '@/core/providers/mock/MockBankProvider';
import { ACCOUNT_TYPE_LABELS_TR } from '@/core/providers/mock/institutions';
import type {
  AlertSeverity,
  BankAccount,
  CancellationStep,
  DetectedSubscription,
  ProviderTransaction,
  RiskBand,
  RiskFactor,
  SubscriptionCategory,
  SubscriptionState,
} from '@/core/types';
import {
  addMonthsClamped,
  formatCountdownTR,
  formatDateShortTR,
  formatDateTR,
} from '@/core/utils/date';
import { formatCompactTRY, formatPercentTR, formatTRY, toLira } from '@/core/utils/money';

// -----------------------------------------------------------------------------
//  View model
// -----------------------------------------------------------------------------

export interface AccountVM {
  id: string;
  institutionName: string;
  displayName: string;
  typeLabel: string;
  maskedNumber: string;
  balanceLabel: string;
  isNegative: boolean;
  brandColor: string;
}

export interface KpiVM {
  id: string;
  label: string;
  value: string;
  /** Secondary line under the value. */
  caption?: string;
  deltaLabel?: string;
  /** Green when the movement is good news for the user, not when it is +ve. */
  deltaIsGood?: boolean;
  accent: 'gold' | 'emerald' | 'indigo' | 'rose';
  /** Sparkline data in lira, oldest first. */
  spark?: number[];
}

export interface BurnPointVM {
  label: string;
  subscriptions: number;
  bills: number;
  total: number;
  isProjected: boolean;
  tooltip: string;
}

export interface CategoryVM {
  key: SubscriptionCategory;
  label: string;
  color: string;
  monthly: number;
  monthlyLabel: string;
  annualLabel: string;
  share: number;
  shareLabel: string;
  count: number;
}

export interface HikeVM {
  merchantKey: string;
  merchantName: string;
  categoryLabel: string;
  color: string;
  fromLabel: string;
  toLabel: string;
  deltaLabel: string;
  deltaPercent: number;
  effectiveLabel: string;
  extraPaidLabel: string;
  annualImpactLabel: string;
}

export interface RenewalVM {
  merchantKey: string;
  merchantName: string;
  amountLabel: string;
  dateLabel: string;
  countdownLabel: string;
  daysUntil: number;
  color: string;
  isImminent: boolean;
}

export interface AlertVM {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  body: string;
}

export interface CancellationVM {
  title: string;
  summary: string;
  channelLabel: string;
  estimatedMinutes: number;
  difficulty: number;
  difficultyLabel: string;
  steps: CancellationStep[];
  deepLink?: string;
  webUrl?: string;
  phoneNumber?: string;
  refundPolicyNote?: string;
  cautions: string[];
  directive?: string;
  savingLabel: string;
  guardUntilLabel: string;
}

export interface SubscriptionVM {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  categoryLabel: string;
  color: string;
  state: SubscriptionState;
  stateLabel: string;
  channelLabel: string;
  channelShort: string;
  cycleLabel: string;
  amountLabel: string;
  cycleSuffix: string;
  monthlyLabel: string;
  annualLabel: string;
  /** Lira, for the in-row bar. */
  monthly: number;
  occurrences: number;
  firstChargedLabel: string;
  lastChargedLabel: string;
  nextRenewalLabel?: string;
  countdownLabel?: string;
  daysUntilRenewal?: number;
  riskScore: number;
  riskBand: RiskBand;
  riskBandLabel: string;
  riskFactors: RiskFactor[];
  confidencePercent: number;
  needsUserLabel: boolean;
  accountLabel: string;
  multiAccount: boolean;
  hikeCount: number;
  totalPaidLabel: string;
  /** 12-month amount history in lira for the row sparkline. */
  spark: number[];
  cancellation: CancellationVM;
}

export interface DashboardViewModel {
  user: { name: string; greetingTR: string };
  asOfLabel: string;
  accounts: AccountVM[];
  kpis: KpiVM[];
  burn: {
    points: BurnPointVM[];
    currentLabel: string;
    previousLabel: string;
    deltaLabel: string;
    deltaIsGood: boolean;
    averageLabel: string;
    shareLabel: string;
  };
  categories: CategoryVM[];
  projection: {
    projectedAnnualLabel: string;
    realizedLabel: string;
    remainingLabel: string;
    runRateLabel: string;
    yearElapsedPercent: number;
    narrative: string;
  };
  hikes: HikeVM[];
  renewals: RenewalVM[];
  alerts: AlertVM[];
  subscriptions: SubscriptionVM[];
  meta: {
    engineVersion: string;
    transactionsScanned: number;
    noiseFiltered: number;
    detectedCount: number;
    candidateCount: number;
    elapsedMs: number;
    providerName: string;
  };
}

const DEMO_USER = { name: 'Hikmet', nationalId: undefined as string | undefined };

// -----------------------------------------------------------------------------
//  Loader
// -----------------------------------------------------------------------------

export async function loadDashboard(): Promise<DashboardViewModel> {
  const provider = getBankProvider();
  const startedAt = process.hrtime.bigint();

  // The mock provider exposes the whole persona at once; a live adapter would
  // list accounts from stored consents instead.
  const accounts: BankAccount[] =
    provider instanceof MockBankProvider
      ? provider.getAllAccounts()
      : await provider.listAccounts('default');

  const now = provider instanceof MockBankProvider ? provider.getReferenceDate() : new Date();
  const windowStart = addMonthsClamped(now, -24);

  const transactions: ProviderTransaction[] = [];
  for (const account of accounts) {
    let cursor: string | undefined;
    do {
      const page = await provider.fetchTransactions(account.id, windowStart, now, {
        limit: 500,
        cursor,
      });
      transactions.push(...page.transactions);
      cursor = page.nextCursor;
    } while (cursor);
  }

  const engagementSignals =
    provider instanceof MockBankProvider ? provider.engagementSignals : undefined;

  const detection = detectSubscriptions({ transactions, engagementSignals, now });
  const analytics = buildDashboardAnalytics({
    subscriptions: detection.subscriptions,
    transactions,
    now,
  });

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  // ---------------------------------------------------------------------------
  //  KPI tiles
  // ---------------------------------------------------------------------------
  const burnSpark = analytics.burnRate.series.map((point) => toLira(point.total));
  const deltaIsGood = analytics.burnRate.deltaAmount <= 0;

  const kpis: KpiVM[] = [
    {
      id: 'monthly-burn',
      label: 'Aylık Abonelik Yükü',
      value: formatTRY(analytics.burnRate.currentMonth),
      caption: `Geçen ay ${formatTRY(analytics.burnRate.previousMonth)}`,
      deltaLabel: formatPercentTR(analytics.burnRate.deltaPercent),
      deltaIsGood,
      accent: 'gold',
      spark: burnSpark,
    },
    {
      id: 'annual-projection',
      label: 'Yıllık Projeksiyon',
      value: formatCompactTRY(analytics.projection.projectedAnnual),
      caption: `${formatTRY(analytics.projection.realizedYearToDate, { whole: true })} bu yıl ödendi`,
      accent: 'indigo',
    },
    {
      id: 'potential-saving',
      label: 'Potansiyel Yıllık Tasarruf',
      value: formatCompactTRY(analytics.savings.potentialAnnualSaving),
      caption: `${analytics.savings.zombieCount} unutulmuş abonelik tespit edildi`,
      accent: 'emerald',
    },
    {
      id: 'detected',
      label: 'Takip Edilen Abonelik',
      value: String(analytics.totals.liveCount),
      caption: `${detection.transactionsScanned.toLocaleString('tr-TR')} işlem tarandı`,
      accent: 'gold',
    },
  ];

  // ---------------------------------------------------------------------------
  //  Subscriptions
  // ---------------------------------------------------------------------------
  const subscriptions = detection.subscriptions.map((subscription) =>
    toSubscriptionVM(subscription, accountsById, now),
  );

  return {
    user: {
      name: DEMO_USER.name,
      greetingTR: greetingFor(now),
    },
    asOfLabel: formatDateTR(now),
    accounts: accounts.map(toAccountVM),
    kpis,

    burn: {
      points: analytics.burnRate.series.map((point) => ({
        label: point.label,
        subscriptions: toLira(point.subscriptions),
        bills: toLira(point.bills),
        total: toLira(point.total),
        isProjected: point.isProjected,
        tooltip: point.isProjected
          ? `${point.label} · öngörülen ${formatTRY(point.total)}`
          : `${point.label} · ${formatTRY(point.total)}`,
      })),
      currentLabel: formatTRY(analytics.burnRate.currentMonth),
      previousLabel: formatTRY(analytics.burnRate.previousMonth),
      deltaLabel: formatPercentTR(analytics.burnRate.deltaPercent),
      deltaIsGood,
      averageLabel: formatTRY(analytics.burnRate.sixMonthAverage),
      shareLabel: `Toplam harcamanızın %${Math.round(analytics.spendContext.subscriptionShare * 100)}'i`,
    },

    categories: analytics.categoryBreakdown.map((slice) => ({
      key: slice.category,
      label: CATEGORY_LABELS_TR[slice.category],
      color: CATEGORY_COLORS[slice.category],
      monthly: toLira(slice.monthlyAmount),
      monthlyLabel: formatTRY(slice.monthlyAmount),
      annualLabel: formatTRY(slice.annualAmount, { whole: true }),
      share: slice.share,
      shareLabel: `%${(slice.share * 100).toFixed(1)}`,
      count: slice.count,
    })),

    projection: {
      projectedAnnualLabel: formatTRY(analytics.projection.projectedAnnual, { whole: true }),
      realizedLabel: formatTRY(analytics.projection.realizedYearToDate, { whole: true }),
      remainingLabel: formatTRY(analytics.projection.remainingThisYear, { whole: true }),
      runRateLabel: formatTRY(analytics.projection.committedMonthlyRunRate),
      yearElapsedPercent: Math.round(analytics.projection.yearElapsed * 100),
      narrative: `Mevcut aboneliklerinizi sürdürürseniz ${now.getUTCFullYear()} yılını ${formatTRY(
        analytics.projection.projectedAnnual,
        { whole: true },
      )} abonelik harcamasıyla kapatacaksınız.`,
    },

    hikes: analytics.priceHikeRadar.map((hike) => ({
      merchantKey: hike.merchantKey,
      merchantName: hike.merchantName,
      categoryLabel: CATEGORY_LABELS_TR[hike.category],
      color: CATEGORY_COLORS[hike.category],
      fromLabel: formatTRY(hike.previousAmount),
      toLabel: formatTRY(hike.newAmount),
      deltaLabel: formatPercentTR(hike.deltaPercent),
      deltaPercent: hike.deltaPercent,
      effectiveLabel: formatDateTR(hike.effectiveAt),
      extraPaidLabel: formatTRY(hike.extraPaidToDate),
      annualImpactLabel: formatTRY(hike.projectedAnnualImpact, { whole: true }),
    })),

    renewals: analytics.upcomingRenewals.slice(0, 8).map((renewal) => ({
      merchantKey: renewal.merchantKey,
      merchantName: renewal.merchantName,
      amountLabel: formatTRY(renewal.amount),
      dateLabel: formatDateShortTR(renewal.renewalAt),
      countdownLabel: formatCountdownTR(renewal.renewalAt, now),
      daysUntil: renewal.daysUntil,
      color: CATEGORY_COLORS[renewal.category],
      isImminent: renewal.daysUntil <= 3,
    })),

    alerts: detection.alerts.slice(0, 6).map((alert) => ({
      id: alert.dedupeKey,
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
    })),

    subscriptions,

    meta: {
      engineVersion: ENGINE_VERSION,
      transactionsScanned: detection.transactionsScanned,
      noiseFiltered: detection.noiseFiltered,
      detectedCount: detection.subscriptions.length,
      candidateCount: detection.candidates.length,
      elapsedMs: Math.round(elapsedMs * 10) / 10,
      providerName: provider.displayName,
    },
  };
}

// -----------------------------------------------------------------------------
//  Mappers
// -----------------------------------------------------------------------------

function toAccountVM(account: BankAccount): AccountVM {
  return {
    id: account.id,
    institutionName: account.institutionName,
    displayName: account.displayName,
    typeLabel: ACCOUNT_TYPE_LABELS_TR[account.accountType] ?? account.accountType,
    maskedNumber: account.maskedNumber,
    balanceLabel: formatTRY(account.balance),
    isNegative: account.balance < 0,
    brandColor: account.brandColor,
  };
}

const DIFFICULTY_LABELS_TR = [
  '',
  'Çok kolay',
  'Kolay',
  'Orta',
  'Zor',
  'Çok zor — ısrarcı akış',
] as const;

function toSubscriptionVM(
  subscription: DetectedSubscription,
  accountsById: Map<string, BankAccount>,
  now: Date,
): SubscriptionVM {
  const account = accountsById.get(subscription.primaryAccountId);

  const plan = buildCancellationPlan({
    subscription,
    account,
    customerName: DEMO_USER.name,
    nationalId: DEMO_USER.nationalId,
    contractTerminated: false,
    now,
  });

  // Last 12 charges, in lira, for the row sparkline.
  const spark = subscription.charges.slice(-12).map((charge) => toLira(charge.amount));

  return {
    merchantKey: subscription.merchantKey,
    merchantName: subscription.merchantName,
    category: subscription.category,
    categoryLabel: CATEGORY_LABELS_TR[subscription.category],
    color: CATEGORY_COLORS[subscription.category],
    state: subscription.state,
    stateLabel: STATE_LABELS_TR[subscription.state],
    channelLabel: CHANNEL_LABELS_TR[subscription.billingChannel],
    channelShort: CHANNEL_SHORT_TR[subscription.billingChannel],
    cycleLabel: CYCLE_LABELS_TR[subscription.billingCycle],
    amountLabel: formatTRY(subscription.currentAmount),
    cycleSuffix: CYCLE_SUFFIX_TR[subscription.billingCycle],
    monthlyLabel: formatTRY(subscription.monthlyEquivalent),
    annualLabel: formatTRY(subscription.annualEquivalent, { whole: true }),
    monthly: toLira(subscription.monthlyEquivalent),
    occurrences: subscription.occurrences,
    firstChargedLabel: formatDateTR(subscription.firstChargedAt),
    lastChargedLabel: formatDateTR(subscription.lastChargedAt),
    nextRenewalLabel: subscription.nextRenewalAt
      ? formatDateTR(subscription.nextRenewalAt)
      : undefined,
    countdownLabel: subscription.nextRenewalAt
      ? formatCountdownTR(subscription.nextRenewalAt, now)
      : undefined,
    daysUntilRenewal: subscription.nextRenewalAt
      ? Math.round((subscription.nextRenewalAt.getTime() - now.getTime()) / 86_400_000)
      : undefined,
    riskScore: subscription.forgottenRiskScore,
    riskBand: subscription.riskBand,
    riskBandLabel: RISK_BAND_LABELS_TR[subscription.riskBand],
    riskFactors: subscription.riskFactors,
    confidencePercent: Math.round(subscription.detectionConfidence * 100),
    needsUserLabel: subscription.needsUserLabel,
    accountLabel: account ? `${account.institutionName} · ${account.displayName}` : 'Bilinmeyen hesap',
    multiAccount: subscription.involvedAccountIds.length > 1,
    hikeCount: subscription.priceChanges.filter((change) => !change.isDecrease).length,
    totalPaidLabel: formatTRY(subscription.totalPaid, { whole: true }),
    spark,

    cancellation: {
      title: plan.guide.title,
      summary: plan.guide.summary,
      channelLabel: CHANNEL_LABELS_TR[plan.channel],
      estimatedMinutes: plan.guide.estimatedMinutes,
      difficulty: plan.guide.difficulty,
      difficultyLabel: DIFFICULTY_LABELS_TR[plan.guide.difficulty] ?? '',
      steps: plan.guide.steps,
      deepLink: plan.guide.deepLink,
      webUrl: plan.guide.webUrl,
      phoneNumber: plan.guide.phoneNumber,
      refundPolicyNote: plan.guide.refundPolicyNote,
      cautions: plan.cautions,
      directive: plan.renderedDirective,
      savingLabel: formatTRY(plan.expectedAnnualSaving, { whole: true }),
      guardUntilLabel: formatDateTR(plan.guardUntil),
    },
  };
}

function greetingFor(now: Date): string {
  // Istanbul is UTC+3 year-round; no DST since 2016.
  const hour = (now.getUTCHours() + 3) % 24;
  if (hour < 6) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}
