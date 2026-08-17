/**
 * Domain types.
 *
 * These mirror the Prisma enums but are declared independently on purpose: the
 * core (providers + detection + analytics) must compile and run with zero
 * knowledge of the persistence layer or of Next.js. That is what lets the same
 * engine be hosted by a NestJS worker, a Lambda, or a `tsx` script — and what
 * lets the test-suite run without a database.
 */

import type { Kurus } from './utils/money';

// -----------------------------------------------------------------------------
//  Enumerations (string unions — structurally compatible with Prisma's enums)
// -----------------------------------------------------------------------------

export const BANK_PROVIDER_KINDS = ['MOCK', 'AOH', 'PAYCELL', 'FINROTA'] as const;
export type BankProviderKind = (typeof BANK_PROVIDER_KINDS)[number];

export const ACCOUNT_TYPES = ['CHECKING', 'CREDIT_CARD', 'PREPAID', 'SAVINGS'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AccountSyncStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'REAUTH_REQUIRED'
  | 'DISCONNECTED'
  | 'ERROR';

export type TransactionDirection = 'DEBIT' | 'CREDIT';

export const BILLING_CHANNELS = [
  'APPLE_IAP',
  'GOOGLE_PLAY',
  'DIRECT_CARD',
  'BANK_STANDING_ORDER',
  'CARRIER_BILLING',
  'WALLET',
  'UNKNOWN',
] as const;
export type BillingChannel = (typeof BILLING_CHANNELS)[number];

export const SUBSCRIPTION_CATEGORIES = [
  'ENTERTAINMENT',
  'MUSIC',
  'AI_CLOUD',
  'SAAS',
  'FITNESS',
  'UTILITIES',
  'TELECOM',
  'NEWS_MEDIA',
  'GAMING',
  'EDUCATION',
  'FOOD_DELIVERY',
  'TRANSPORT',
  'INSURANCE',
  'OTHER',
] as const;
export type SubscriptionCategory = (typeof SUBSCRIPTION_CATEGORIES)[number];

export const BILLING_CYCLES = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'YEARLY',
  'IRREGULAR',
] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export type SubscriptionState =
  | 'ACTIVE'
  | 'VARIABLE_BILL'
  | 'PAUSED'
  | 'CANCELLATION_STARTED'
  | 'CANCELLED'
  | 'LAPSED'
  | 'CANDIDATE';

export type RiskBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type AlertKind =
  | 'RENEWAL_UPCOMING'
  | 'PRICE_HIKE'
  | 'ZOMBIE_SUBSCRIPTION'
  | 'ROGUE_CHARGE'
  | 'DUPLICATE_SERVICE'
  | 'TRIAL_ENDING';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

// -----------------------------------------------------------------------------
//  Institutions & accounts
// -----------------------------------------------------------------------------

export interface Institution {
  id: string;
  provider: BankProviderKind;
  displayName: string;
  legalName: string;
  brandColor: string;
  logoSlug: string;
  bic?: string;
  supportsStandingOrderCancellation: boolean;
  supportsInstantBalance: boolean;
  historyWindowDays: number;
  /** Account kinds this institution can expose. Papara has no credit card. */
  offeredAccountTypes: AccountType[];
}

export interface BankAccount {
  id: string;
  institutionId: string;
  institutionName: string;
  brandColor: string;
  providerAccountRef: string;
  displayName: string;
  accountType: AccountType;
  maskedNumber: string;
  ibanSuffix?: string;
  currency: string;
  balance: Kurus;
  availableBalance: Kurus;
  syncStatus: AccountSyncStatus;
  consentExpiresAt?: Date;
  lastSyncedAt?: Date;
}

export interface ConnectAccountResult {
  accounts: BankAccount[];
  consentExpiresAt: Date;
  /** Opaque token the aggregator would hand back; never a raw credential. */
  sessionRef: string;
}

/** What the caller supplies to `connectAccount`. Never persisted. */
export interface BankCredentials {
  customerNumber: string;
  password: string;
  /** SMS OTP, if the institution's flow demands one. */
  otp?: string;
}

// -----------------------------------------------------------------------------
//  Transactions
// -----------------------------------------------------------------------------

/** A statement line exactly as a provider returns it. */
export interface ProviderTransaction {
  providerTxnRef: string;
  accountId: string;
  bookedAt: Date;
  valueDate?: Date;
  /** Always positive; direction carries the sign. */
  amount: Kurus;
  currency: string;
  direction: TransactionDirection;
  rawDescriptor: string;
  mcc?: string;
  providerMetadata?: Record<string, unknown>;
}

/** A statement line after merchant normalisation. */
export interface EnrichedTransaction extends ProviderTransaction {
  normalizedMerchant: string;
  merchantKey: string;
  category: SubscriptionCategory;
  detectedChannel: BillingChannel;
  /** 0..1 confidence of the merchant match itself. */
  merchantConfidence: number;
  matchStrategy: MerchantMatchStrategy;
  /** True when the normaliser is sure this is one-off retail noise. */
  isNoise: boolean;
}

export type MerchantMatchStrategy =
  | 'USER_OVERRIDE'
  | 'EXACT_ALIAS'
  | 'REGEX_ALIAS'
  | 'TOKEN_CONTAINS'
  | 'FUZZY_BIGRAM'
  | 'UNRESOLVED';

// -----------------------------------------------------------------------------
//  Detection output
// -----------------------------------------------------------------------------

export interface PriceChange {
  previousAmount: Kurus;
  newAmount: Kurus;
  deltaAmount: Kurus;
  deltaPercent: number;
  effectiveAt: Date;
  /** Extra lira this step has already cost, cumulative to `asOf`. */
  extraPaidToDate: Kurus;
  isDecrease: boolean;
}

export interface RiskFactor {
  /** Stable identifier for tests and analytics. */
  code:
    | 'DORMANCY'
    | 'PRICE_CREEP'
    | 'CATEGORY_OVERLAP'
    | 'SILENT_RENEWALS'
    | 'COST_SHARE'
    | 'NEVER_ENGAGED';
  /** Turkish label rendered in the risk drawer. */
  label: string;
  detail: string;
  /** Points this factor contributed to the 0..100 score. */
  points: number;
  maxPoints: number;
}

export interface DetectionSnapshot {
  engineVersion: string;
  intervalsDays: number[];
  medianIntervalDays: number;
  intervalRegularity: number;
  amountCoefficientOfVariation: number;
  anchorDayOfMonth: number;
  anchorAdherence: number;
  missedPeriods: number;
  confidenceBreakdown: Record<string, number>;
  rejectedReason?: string;
}

export interface SubscriptionCharge {
  transactionRef: string;
  accountId: string;
  bookedAt: Date;
  amount: Kurus;
  rawDescriptor: string;
}

export interface DetectedSubscription {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  billingChannel: BillingChannel;
  primaryAccountId: string;
  /** Accounts this stream has ever been charged to (card migrations). */
  involvedAccountIds: string[];

  state: SubscriptionState;
  billingCycle: BillingCycle;
  cycleDays: number;

  currentAmount: Kurus;
  monthlyEquivalent: Kurus;
  annualEquivalent: Kurus;
  currency: string;

  firstChargedAt: Date;
  lastChargedAt: Date;
  occurrences: number;
  totalPaid: Kurus;

  nextRenewalAt?: Date;
  renewalWindowDays: number;

  detectionConfidence: number;
  forgottenRiskScore: number;
  riskBand: RiskBand;
  riskFactors: RiskFactor[];

  /**
   * True when this stream was carved out of a billing aggregator (Apple,
   * Google Play) by anniversary clustering rather than identified by name.
   */
  isAggregatorSplit: boolean;
  /**
   * The engine knows a subscription exists but cannot name the product. The UI
   * asks the user to label it instead of guessing — and the risk engine
   * suppresses its usage-based factors, because "no engagement data" is not
   * the same thing as "not being used".
   */
  needsUserLabel: boolean;

  priceChanges: PriceChange[];
  charges: SubscriptionCharge[];
  snapshot: DetectionSnapshot;
}

export interface DetectionResult {
  engineVersion: string;
  runAt: Date;
  transactionsScanned: number;
  noiseFiltered: number;
  subscriptions: DetectedSubscription[];
  /** Streams that recur but failed the confidence bar — surfaced for review. */
  candidates: DetectedSubscription[];
  alerts: Alert[];
}

// -----------------------------------------------------------------------------
//  Alerts
// -----------------------------------------------------------------------------

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  dedupeKey: string;
  merchantKey?: string;
  payload?: Record<string, string | number>;
  createdAt: Date;
}

// -----------------------------------------------------------------------------
//  Engagement (input to the zombie risk engine)
// -----------------------------------------------------------------------------

export interface EngagementSignal {
  merchantKey: string;
  lastInteractionAt?: Date;
  interactionsLast30d: number;
  source: 'USER_DECLARED' | 'SCREEN_TIME_IMPORT' | 'APP_WEBHOOK' | 'INFERRED';
}

// -----------------------------------------------------------------------------
//  Cancellation
// -----------------------------------------------------------------------------

export interface CancellationStep {
  order: number;
  title: string;
  detail: string;
  deepLink?: string;
  warning?: string;
}

export interface CancellationGuide {
  id: string;
  merchantKey?: string;
  category?: SubscriptionCategory;
  channel: BillingChannel;
  title: string;
  summary: string;
  steps: CancellationStep[];
  deepLink?: string;
  webUrl?: string;
  phoneNumber?: string;
  supportEmail?: string;
  estimatedMinutes: number;
  /** 1 = trivial, 5 = hostile retention flow. */
  difficulty: 1 | 2 | 3 | 4 | 5;
  refundPolicyNote?: string;
  requiresIdentityProof: boolean;
  mandateTemplate?: string;
}

export interface ResolvedCancellationPlan {
  subscriptionMerchantKey: string;
  channel: BillingChannel;
  guide: CancellationGuide;
  /** Rendered, ready-to-copy directive for BANK_STANDING_ORDER cases. */
  renderedDirective?: string;
  expectedMonthlySaving: Kurus;
  expectedAnnualSaving: Kurus;
  /** How long the post-cancellation guard should stay armed. */
  guardUntil: Date;
  /** Turkish caveats specific to this plan. */
  cautions: string[];
}
