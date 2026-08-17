/**
 * Money handling.
 *
 * Every monetary value inside the domain is an **integer number of kuruş**
 * (1 TRY = 100 kuruş). Floating-point lira would accumulate error across the
 * thousands of additions a burn-rate calculation performs, and "1799.9999999"
 * on a private-banking dashboard is unforgivable. Conversion to lira happens
 * only at the presentation boundary.
 */

/** Integer minor units. 179900 === ₺1.799,00 */
export type Kurus = number;

const KURUS_PER_LIRA = 100;

export function lira(amount: number): Kurus {
  return Math.round(amount * KURUS_PER_LIRA);
}

export function toLira(amount: Kurus): number {
  return amount / KURUS_PER_LIRA;
}

export function sumKurus(values: readonly Kurus[]): Kurus {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Proportional split that never loses a kuruş: the remainder is distributed
 * one kuruş at a time to the largest shares. Used when apportioning an annual
 * fee across twelve months.
 */
export function allocate(total: Kurus, parts: number): Kurus[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

const tryFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tryFormatterWhole = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "₺1.799,00" — Turkish grouping (.) and decimal (,) conventions. */
export function formatTRY(amount: Kurus, opts: { whole?: boolean } = {}): string {
  const value = toLira(amount);
  return opts.whole ? tryFormatterWhole.format(value) : tryFormatter.format(value);
}

/** "₺48,6 B" / "₺1,2 Mn" — for hero figures where precision would be noise. */
export function formatCompactTRY(amount: Kurus): string {
  const value = toLira(amount);
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `₺${formatDecimalTR(value / 1_000_000, 1)} Mn`;
  if (abs >= 10_000) return `₺${formatDecimalTR(value / 1_000, 1)} B`;
  return tryFormatterWhole.format(value);
}

function formatDecimalTR(value: number, digits: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Signed percent change, guarding against a zero base. */
export function percentDelta(previous: Kurus, current: Kurus): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** "+%12,4" / "−%3,1" — note the typographic minus, not a hyphen. */
export function formatPercentTR(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}%${formatDecimalTR(Math.abs(value), digits)}`;
}

/**
 * Normalises any billing cycle to a monthly-equivalent cost so that annual,
 * quarterly and monthly plans can be summed into a single burn rate.
 * 365.25/12 keeps the leap-year drift out of yearly projections.
 */
export const DAYS_PER_MONTH = 365.25 / 12;

export function monthlyEquivalent(amount: Kurus, cycleDays: number): Kurus {
  if (cycleDays <= 0) return amount;
  return Math.round((amount * DAYS_PER_MONTH) / cycleDays);
}

export function annualEquivalent(amount: Kurus, cycleDays: number): Kurus {
  if (cycleDays <= 0) return amount * 12;
  return Math.round((amount * 365.25) / cycleDays);
}
