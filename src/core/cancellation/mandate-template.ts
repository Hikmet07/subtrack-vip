/**
 * Bank standing-order cancellation directive generator.
 *
 * Turkish banks will act on a written "otomatik ödeme talimatı iptal" request,
 * but only if it identifies the mandate precisely: account/IBAN suffix, the
 * beneficiary institution, and the effective date. A vague request gets
 * bounced, the next charge lands, and the user blames us.
 *
 * The generated text is deliberately formal (resmî yazışma register) and
 * self-contained, so it can be pasted into a branch email, the bank's secure
 * message channel, or printed and signed.
 */

import type { BillingChannel } from '../types';
import { addDays, formatDateTR } from '../utils/date';
import { formatTRY, type Kurus } from '../utils/money';

export interface MandateTemplateInput {
  /** Account holder's legal name, as registered with the bank. */
  customerName: string;
  /** Turkish national ID. Optional — omitted from the letter when absent. */
  nationalId?: string;
  bankName: string;
  /** Last four digits only. The full IBAN never enters our system. */
  ibanSuffix?: string;
  maskedAccountNumber: string;
  /** Beneficiary of the standing order, e.g. "MACFit Spor Salonları A.Ş.". */
  beneficiaryName: string;
  /** Reference printed on the statement line, when we have one. */
  mandateReference?: string;
  lastChargeAmount: Kurus;
  lastChargeDate: Date;
  /** When the cancellation should take effect. Defaults to "immediately". */
  effectiveFrom: Date;
  /** Set when the user has already terminated the underlying contract. */
  contractTerminated: boolean;
}

/**
 * Renders the directive.
 *
 * Note the explicit sentence separating mandate cancellation from contract
 * termination. Users routinely believe the two are the same thing; stating it
 * in the letter protects them from a debt-collection surprise, and stating it
 * to the bank pre-empts the "sözleşmenizi feshettiniz mi?" round-trip.
 */
export function renderBankMandateDirective(input: MandateTemplateInput): string {
  const today = formatDateTR(new Date(input.effectiveFrom));

  const identityLine = input.nationalId
    ? `T.C. Kimlik No: ${input.nationalId}`
    : 'T.C. Kimlik No: [kimlik numaranızı yazınız]';

  const accountLine = input.ibanSuffix
    ? `IBAN (son 4 hane): ****${input.ibanSuffix}`
    : `Hesap/Kart No: ${input.maskedAccountNumber}`;

  const referenceLine = input.mandateReference
    ? `Talimat Referansı: ${input.mandateReference}`
    : 'Talimat Referansı: [ekstrenizde yer alan referans numarası]';

  const contractClause = input.contractTerminated
    ? 'İlgili hizmet sağlayıcı ile aramdaki sözleşme tarafımca feshedilmiş olup, fesih bildirimi hizmet sağlayıcıya iletilmiştir.'
    : 'Hizmet sağlayıcı ile olan sözleşmemin feshi için ayrıca başvuruda bulunacağımı, işbu talebimin yalnızca banka nezdindeki ödeme talimatının iptaline ilişkin olduğunu beyan ederim.';

  return `${input.bankName} Genel Müdürlüğü'ne / İlgili Şubesine

Konu: Otomatik Ödeme Talimatının İptali Hakkında

Sayın Yetkili,

Aşağıda bilgileri yer alan hesabım üzerinden, ${input.beneficiaryName} lehine tanımlı bulunan otomatik ödeme talimatının iptal edilmesini talep ediyorum.

Hesap Sahibi: ${input.customerName}
${identityLine}
${accountLine}
${referenceLine}
Lehtar Kurum: ${input.beneficiaryName}
Son Tahsilat: ${formatTRY(input.lastChargeAmount)} — ${formatDateTR(input.lastChargeDate)}

Talebimin ${today} tarihinden itibaren geçerli olmasını ve bu tarihten sonra anılan lehtar adına hesabımdan herhangi bir tahsilat gerçekleştirilmemesini rica ederim.

${contractClause}

Talimatın iptal edildiğine dair teyidin tarafıma yazılı olarak (e-posta veya internet bankacılığı mesaj kutusu üzerinden) bildirilmesini talep ederim.

Gereğini bilgilerinize arz ederim.

Saygılarımla,

${input.customerName}
Tarih: ${today}
İmza: ..............................`;
}

/**
 * Short SMS/in-app-message variant for banks whose secure channel caps length.
 */
export function renderShortMandateRequest(input: MandateTemplateInput): string {
  return `${input.beneficiaryName} lehine tanımlı otomatik ödeme talimatımın ${formatDateTR(
    input.effectiveFrom,
  )} tarihinden itibaren iptalini talep ediyorum. Hesap: ${input.maskedAccountNumber}. Son tahsilat: ${formatTRY(
    input.lastChargeAmount,
  )} (${formatDateTR(input.lastChargeDate)}). Teyidin yazılı iletilmesini rica ederim. — ${input.customerName}`;
}

/**
 * How long the post-cancellation guard should stay armed.
 *
 * One full cycle would be too tight: a merchant that bills on the 1st and
 * receives the cancellation on the 2nd has an entire month to make a mistake,
 * and retry logic can push a rogue charge days past the anniversary. One cycle
 * plus a 30-day buffer covers both, with a 60-day floor for short cycles.
 */
export function computeGuardWindow(cycleDays: number, from: Date): Date {
  return addDays(from, Math.max(60, cycleDays + 30));
}

/** Channels where a directive letter is meaningful at all. */
export function requiresMandateDirective(channel: BillingChannel): boolean {
  return channel === 'BANK_STANDING_ORDER';
}
