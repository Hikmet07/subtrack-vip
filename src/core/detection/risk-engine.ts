/**
 * Forgotten / zombie subscription risk engine.
 *
 * A "zombie" is a subscription that is alive on the statement and dead in the
 * user's life. Detecting one is not a spending question — ₺49/month you use
 * daily is fine, ₺1.289/month you last opened nine months ago is not.
 *
 * The score is an additive 0–100 across six weighted factors. Additive (rather
 * than a learned model) is a deliberate product decision: every point on the
 * dashboard must be explainable to the user in one Turkish sentence, and a
 * black-box score in a financial product destroys trust the moment it is wrong.
 */

import type { EngagementSignal, RiskBand, RiskFactor, SubscriptionCategory } from '../types';
import { daysBetween } from '../utils/date';
import { formatTRY, type Kurus } from '../utils/money';
import { clamp, normalize } from '../utils/stats';

/** Factor weights. These sum to 100 — asserted at module load. */
export const RISK_WEIGHTS = {
  DORMANCY: 30,
  NEVER_ENGAGED: 10,
  SILENT_RENEWALS: 20,
  PRICE_CREEP: 15,
  CATEGORY_OVERLAP: 15,
  COST_SHARE: 10,
} as const;

const WEIGHT_TOTAL = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
if (WEIGHT_TOTAL !== 100) {
  throw new Error(`Risk weights must sum to 100, got ${WEIGHT_TOTAL}`);
}

export interface RiskInput {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  monthlyEquivalent: Kurus;
  cycleDays: number;
  occurrences: number;
  firstChargedAt: Date;
  lastChargedAt: Date;
  cumulativeIncreasePercent: number;
  engagement?: EngagementSignal;
  /**
   * Set when the product behind the charge could not be identified (an
   * unlabelled Apple/Google aggregator stream). Absence of engagement data is
   * then meaningless, so the usage-based factors are suppressed rather than
   * scored as dormancy — otherwise every unnamed stream would be branded a
   * zombie purely because we don't know what it is.
   */
  engagementUnknown?: boolean;
  /** Other ACTIVE subscriptions the user holds in the same category. */
  sameCategoryCount: number;
  /** Total monthly burn across all subscriptions, for the cost-share factor. */
  totalMonthlyBurn: Kurus;
  now: Date;
}

export interface RiskAssessment {
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
  /** One-line Turkish verdict for the card header. */
  headline: string;
}

const MONTH_DAYS = 30.44;

export function assessForgottenRisk(input: RiskInput): RiskAssessment {
  const factors: RiskFactor[] = [];
  const usageKnown = !input.engagementUnknown;

  // ---------------------------------------------------------------------------
  //  1. Dormancy — months since the user last touched the service
  // ---------------------------------------------------------------------------
  const lastInteraction = input.engagement?.lastInteractionAt;
  const dormancyMonths = lastInteraction
    ? Math.max(0, daysBetween(lastInteraction, input.now) / MONTH_DAYS)
    : Math.max(0, daysBetween(input.firstChargedAt, input.now) / MONTH_DAYS);

  // Ramps from 0 at "used this month" to full weight at 9 months untouched.
  const dormancyPoints = usageKnown
    ? Math.round(normalize(dormancyMonths, 1, 9) * RISK_WEIGHTS.DORMANCY)
    : 0;
  if (dormancyPoints > 0) {
    factors.push({
      code: 'DORMANCY',
      label: 'Uzun süredir kullanılmıyor',
      detail: `Son etkileşim ${Math.floor(dormancyMonths)} ay önce. Ödemeler kesintisiz devam ediyor.`,
      points: dormancyPoints,
      maxPoints: RISK_WEIGHTS.DORMANCY,
    });
  }

  // ---------------------------------------------------------------------------
  //  2. Never engaged — signed up, charged, never opened
  // ---------------------------------------------------------------------------
  if (usageKnown && !lastInteraction && input.occurrences >= 3) {
    factors.push({
      code: 'NEVER_ENGAGED',
      label: 'Hiç kullanılmamış',
      detail: `${input.occurrences} kez ücret alındı, kayıtlı hiçbir kullanım yok.`,
      points: RISK_WEIGHTS.NEVER_ENGAGED,
      maxPoints: RISK_WEIGHTS.NEVER_ENGAGED,
    });
  }

  // ---------------------------------------------------------------------------
  //  3. Silent renewals — charges taken since the last interaction
  // ---------------------------------------------------------------------------
  const silentRenewals = lastInteraction
    ? Math.floor(Math.max(0, daysBetween(lastInteraction, input.lastChargedAt)) / Math.max(input.cycleDays, 1))
    : input.occurrences;

  const silentPoints = usageKnown
    ? Math.round(normalize(silentRenewals, 1, 8) * RISK_WEIGHTS.SILENT_RENEWALS)
    : 0;
  if (silentPoints > 0) {
    const wasted = input.monthlyEquivalent * silentRenewals;
    factors.push({
      code: 'SILENT_RENEWALS',
      label: 'Sessiz yenilemeler',
      detail: `Son kullanımdan bu yana ${silentRenewals} kez otomatik yenilendi (~${formatTRY(wasted, { whole: true })}).`,
      points: silentPoints,
      maxPoints: RISK_WEIGHTS.SILENT_RENEWALS,
    });
  }

  // ---------------------------------------------------------------------------
  //  4. Price creep — quietly more expensive than when it was signed up for
  // ---------------------------------------------------------------------------
  const creepPoints = Math.round(
    normalize(input.cumulativeIncreasePercent, 15, 120) * RISK_WEIGHTS.PRICE_CREEP,
  );
  if (creepPoints > 0) {
    factors.push({
      code: 'PRICE_CREEP',
      label: 'Sessiz zam birikimi',
      detail: `Başlangıç fiyatına göre %${Math.round(input.cumulativeIncreasePercent)} artış yaşandı.`,
      points: creepPoints,
      maxPoints: RISK_WEIGHTS.PRICE_CREEP,
    });
  }

  // ---------------------------------------------------------------------------
  //  5. Category overlap — three streaming services is two too many
  // ---------------------------------------------------------------------------
  const overlapPoints = Math.round(
    normalize(input.sameCategoryCount, 1, 4) * RISK_WEIGHTS.CATEGORY_OVERLAP,
  );
  if (overlapPoints > 0) {
    factors.push({
      code: 'CATEGORY_OVERLAP',
      label: 'Aynı kategoride çakışma',
      detail: `Bu kategoride ${input.sameCategoryCount + 1} aktif aboneliğiniz var; işlevleri büyük ölçüde örtüşüyor.`,
      points: overlapPoints,
      maxPoints: RISK_WEIGHTS.CATEGORY_OVERLAP,
    });
  }

  // ---------------------------------------------------------------------------
  //  6. Cost share — an expensive zombie is worse than a cheap one
  // ---------------------------------------------------------------------------
  const share =
    input.totalMonthlyBurn > 0 ? input.monthlyEquivalent / input.totalMonthlyBurn : 0;
  const costPoints = Math.round(normalize(share, 0.05, 0.25) * RISK_WEIGHTS.COST_SHARE);
  if (costPoints > 0) {
    factors.push({
      code: 'COST_SHARE',
      label: 'Bütçedeki ağırlığı yüksek',
      detail: `Aylık abonelik yükünüzün %${Math.round(share * 100)}'ini tek başına oluşturuyor.`,
      points: costPoints,
      maxPoints: RISK_WEIGHTS.COST_SHARE,
    });
  }

  const score = clamp(
    factors.reduce((acc, factor) => acc + factor.points, 0),
    0,
    100,
  );

  return {
    score,
    band: toBand(score),
    factors: factors.sort((a, b) => b.points - a.points),
    headline: usageKnown
      ? buildHeadline(score, input, dormancyMonths)
      : `${input.merchantName} tanımlanamadı — hangi hizmet olduğunu etiketlerseniz risk puanı hesaplanabilir.`,
  };
}

export function toBand(score: number): RiskBand {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MODERATE';
  return 'LOW';
}

export const RISK_BAND_LABELS_TR: Record<RiskBand, string> = {
  LOW: 'Düşük risk',
  MODERATE: 'Orta risk',
  HIGH: 'Yüksek risk',
  CRITICAL: 'Kritik — unutulmuş',
};

function buildHeadline(score: number, input: RiskInput, dormancyMonths: number): string {
  const annual = input.monthlyEquivalent * 12;
  if (score >= 75) {
    return `${input.merchantName} ${Math.floor(dormancyMonths)} aydır kullanılmıyor ve yılda ${formatTRY(annual, { whole: true })} götürüyor.`;
  }
  if (score >= 50) {
    return `${input.merchantName} için kullanım sinyali zayıf; iptal ederseniz yılda ${formatTRY(annual, { whole: true })} tasarruf edersiniz.`;
  }
  if (score >= 25) {
    return `${input.merchantName} düzenli kullanılıyor ancak maliyeti izlenmeye değer.`;
  }
  return `${input.merchantName} aktif olarak kullanılıyor.`;
}
