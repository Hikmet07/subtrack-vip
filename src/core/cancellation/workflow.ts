/**
 * Cancellation workflow: plan generation and the post-cancellation guard.
 *
 * The guard is the part users actually pay for. Cancelling is a five-minute
 * chore; discovering four months later that the charge never stopped is the
 * expensive part. After a cancellation we keep watching the merchant, and any
 * debit that appears inside the guard window is escalated immediately with the
 * evidence attached.
 */

import type {
  Alert,
  BankAccount,
  DetectedSubscription,
  ProviderTransaction,
  ResolvedCancellationPlan,
} from '../types';
import { CHANNEL_LABELS_TR } from '../i18n/tr';
import { normalizeMerchant } from '../detection/normalization';
import { formatDateTR } from '../utils/date';
import { formatTRY } from '../utils/money';
import { resolveCancellationGuide } from './guides';
import {
  computeGuardWindow,
  renderBankMandateDirective,
  requiresMandateDirective,
} from './mandate-template';

export interface BuildCancellationPlanInput {
  subscription: DetectedSubscription;
  /** The account the standing order or card charge lives on. */
  account?: BankAccount;
  customerName: string;
  nationalId?: string;
  /** True when the user confirms the service contract is already terminated. */
  contractTerminated?: boolean;
  now: Date;
}

export function buildCancellationPlan(
  input: BuildCancellationPlanInput,
): ResolvedCancellationPlan {
  const { subscription, account, now } = input;

  const guide = resolveCancellationGuide(
    subscription.merchantKey,
    subscription.category,
    subscription.billingChannel,
  );

  const cautions = buildCautions(subscription, guide.difficulty);

  let renderedDirective: string | undefined;
  if (requiresMandateDirective(subscription.billingChannel)) {
    renderedDirective = renderBankMandateDirective({
      customerName: input.customerName,
      nationalId: input.nationalId,
      bankName: account?.institutionName ?? '[bankanızın adı]',
      ibanSuffix: account?.ibanSuffix,
      maskedAccountNumber: account?.maskedNumber ?? '[hesap numaranız]',
      beneficiaryName: subscription.merchantName,
      mandateReference: subscription.charges[subscription.charges.length - 1]?.transactionRef,
      lastChargeAmount: subscription.currentAmount,
      lastChargeDate: subscription.lastChargedAt,
      effectiveFrom: now,
      contractTerminated: input.contractTerminated ?? false,
    });
  }

  return {
    subscriptionMerchantKey: subscription.merchantKey,
    channel: subscription.billingChannel,
    guide,
    renderedDirective,
    expectedMonthlySaving: subscription.monthlyEquivalent,
    expectedAnnualSaving: subscription.annualEquivalent,
    guardUntil: computeGuardWindow(subscription.cycleDays, now),
    cautions,
  };
}

function buildCautions(subscription: DetectedSubscription, difficulty: number): string[] {
  const cautions: string[] = [];

  if (subscription.needsUserLabel) {
    cautions.push(
      `Bu tahsilat ${CHANNEL_LABELS_TR[subscription.billingChannel]} üzerinden toplu olarak alınıyor ve hangi hizmete ait olduğu ekstreden anlaşılamıyor. İptal ekranında tutarı (${formatTRY(subscription.currentAmount)}) ve yenileme gününü karşılaştırarak doğru aboneliği seçin.`,
    );
  }

  if (subscription.involvedAccountIds.length > 1) {
    cautions.push(
      'Bu abonelik geçmişte birden fazla karta yansımış. İptal sonrası tüm kartlarınızı izleyeceğiz.',
    );
  }

  if (subscription.billingCycle === 'YEARLY') {
    cautions.push(
      `Yıllık ödemeli bir plan. İptal etseniz bile ${formatDateTR(subscription.nextRenewalAt ?? subscription.lastChargedAt)} tarihine kadar hizmeti kullanmaya devam edebilirsiniz.`,
    );
  }

  if (difficulty >= 4) {
    cautions.push(
      'Bu hizmetin iptal akışı zorlaştırıcı adımlar içeriyor. Her adımın ekran görüntüsünü almanızı öneririz.',
    );
  }

  if (subscription.state === 'VARIABLE_BILL') {
    cautions.push(
      'Bu bir zorunlu hizmet faturasıdır. Talimatı iptal etmek borcu ortadan kaldırmaz, yalnızca ödeme kolaylığını sonlandırır.',
    );
  }

  return cautions;
}

// -----------------------------------------------------------------------------
//  Post-cancellation guard
// -----------------------------------------------------------------------------

export interface GuardedSubscription {
  merchantKey: string;
  merchantName: string;
  cancelledAt: Date;
  guardUntil: Date;
  /** Amount that used to be charged, for comparison in the alert. */
  expectedAmount: number;
}

export interface RogueChargeFinding {
  merchantKey: string;
  merchantName: string;
  transactionRef: string;
  accountId: string;
  bookedAt: Date;
  amount: number;
  rawDescriptor: string;
  daysAfterCancellation: number;
}

/**
 * Scans fresh statement lines for charges from an already-cancelled merchant.
 *
 * Matching runs through the *same* normaliser as detection rather than a string
 * compare on the merchant name. Merchants very often change their descriptor
 * after a cancellation dispute — a re-bill can arrive as "NETFLIX INTERNATIONAL
 * B.V." when the original said "POS-NETFLIX.COM/BILL" — and a naive equality
 * check would sail straight past it.
 */
export function detectRogueCharges(
  guarded: GuardedSubscription[],
  transactions: ProviderTransaction[],
  now: Date,
): RogueChargeFinding[] {
  if (guarded.length === 0) return [];

  const byKey = new Map(guarded.map((entry) => [entry.merchantKey.split('::')[0]!, entry]));
  const findings: RogueChargeFinding[] = [];

  for (const txn of transactions) {
    if (txn.direction !== 'DEBIT') continue;

    const merchant = normalizeMerchant(txn.rawDescriptor);
    const watch = byKey.get(merchant.merchantKey.split('::')[0]!);
    if (!watch) continue;

    // Only charges strictly after the cancellation, inside the guard window.
    if (txn.bookedAt <= watch.cancelledAt) continue;
    if (txn.bookedAt > watch.guardUntil) continue;
    if (txn.bookedAt > now) continue;

    findings.push({
      merchantKey: watch.merchantKey,
      merchantName: watch.merchantName,
      transactionRef: txn.providerTxnRef,
      accountId: txn.accountId,
      bookedAt: txn.bookedAt,
      amount: txn.amount,
      rawDescriptor: txn.rawDescriptor,
      daysAfterCancellation: Math.round(
        (txn.bookedAt.getTime() - watch.cancelledAt.getTime()) / 86_400_000,
      ),
    });
  }

  return findings.sort((a, b) => b.bookedAt.getTime() - a.bookedAt.getTime());
}

export function buildRogueChargeAlerts(findings: RogueChargeFinding[], now: Date): Alert[] {
  return findings.map((finding) => ({
    kind: 'ROGUE_CHARGE' as const,
    severity: 'CRITICAL' as const,
    title: `${finding.merchantName} iptal sonrası tahsilat yaptı`,
    body: `İptalden ${finding.daysAfterCancellation} gün sonra ${formatTRY(finding.amount)} tahsil edildi (${formatDateTR(finding.bookedAt)}). Ekstre açıklaması: "${finding.rawDescriptor}". Bu tutar için bankanıza itiraz hakkınız bulunuyor.`,
    dedupeKey: `ROGUE_CHARGE:${finding.merchantKey}:${finding.transactionRef}`,
    merchantKey: finding.merchantKey,
    payload: {
      amount: finding.amount,
      daysAfterCancellation: finding.daysAfterCancellation,
      transactionRef: finding.transactionRef,
    },
    createdAt: now,
  }));
}
