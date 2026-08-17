/**
 * Date helpers.
 *
 * All internal arithmetic is done in UTC. Turkey sits on a fixed UTC+3 with no
 * DST since 2016, but the engine must stay correct for users travelling or for
 * statements delivered with a foreign booking timezone — so we normalise on the
 * way in and localise only on the way out.
 */

export const MS_PER_DAY = 86_400_000;

export function utcDate(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day, 12, 0, 0, 0));
}

/** Midday UTC — keeps a date immune to ±12h timezone shifts when rendered. */
export function atNoonUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0),
  );
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Adds calendar months, clamping to the end of the target month.
 * 31 Ocak + 1 ay => 28/29 Şubat, which is exactly how card networks behave.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = daysInMonth(year, month);
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 12, 0, 0, 0));
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Whole days between two instants (b - a), rounded to the nearest day. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0, 0));
}

export function endOfMonthUTC(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      daysInMonth(date.getUTCFullYear(), date.getUTCMonth()),
      12,
      0,
      0,
      0,
    ),
  );
}

/** "2026-04" — stable sort key and Map key for monthly buckets. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthKeyToDate(key: string): Date {
  const [year, month] = key.split('-').map(Number);
  return utcDate(year ?? 1970, month ?? 1, 1);
}

/** Descending-safe: returns the last `count` month keys ending at `end`. */
export function trailingMonthKeys(end: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKey(addMonthsClamped(startOfMonthUTC(end), -i)));
  }
  return keys;
}

export const TR_MONTHS_LONG = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export const TR_MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

/** "14 Nisan 2026" */
export function formatDateTR(date: Date): string {
  return `${date.getUTCDate()} ${TR_MONTHS_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "14 Nis" — for dense table cells. */
export function formatDateShortTR(date: Date): string {
  return `${date.getUTCDate()} ${TR_MONTHS_SHORT[date.getUTCMonth()]}`;
}

/** "Nis 26" — chart axis label. */
export function formatMonthKeyTR(key: string): string {
  const date = monthKeyToDate(key);
  return `${TR_MONTHS_SHORT[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
}

/**
 * Natural-language countdown in Turkish. Renewal urgency is the single most
 * glanced-at string in the product, so it gets real copy rather than "in 3 d".
 */
export function formatCountdownTR(target: Date, now: Date): string {
  const days = daysBetween(atNoonUTC(now), atNoonUTC(target));
  if (days < -1) return `${Math.abs(days)} gün gecikti`;
  if (days === -1) return 'Dün bekleniyordu';
  if (days === 0) return 'Bugün yenileniyor';
  if (days === 1) return 'Yarın yenileniyor';
  if (days <= 7) return `${days} gün içinde`;
  if (days <= 45) return `${days} gün sonra`;
  const months = Math.round(days / 30);
  return `~${months} ay sonra`;
}

/** "6 aydır dokunulmamış" style dormancy phrasing. */
export function formatDormancyTR(months: number): string {
  if (months < 1) return 'Bu ay kullanıldı';
  if (months === 1) return '1 aydır kullanılmıyor';
  if (months >= 24) return '2 yıldan uzun süredir kullanılmıyor';
  if (months >= 12) return `${Math.floor(months / 12)} yıldır kullanılmıyor`;
  return `${months} aydır kullanılmıyor`;
}
