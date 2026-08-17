/**
 * End-to-end detection demo and scorecard.
 *
 *     npm run demo
 *
 * Runs the mock provider, feeds 24 months of multi-bank statements through the
 * detection engine, and scores the result against the generator's ground truth.
 * This is the fastest way to see the whole core working without a database, a
 * browser or a network call — and it is a real regression harness: if a
 * heuristic change drops recall, the number moves.
 */

import { MockBankProvider } from '../src/core/providers/mock/MockBankProvider';
import { detectSubscriptions } from '../src/core/detection/engine';
import { buildDashboardAnalytics } from '../src/core/analytics/dashboard';
import { CATEGORY_LABELS_TR, CYCLE_LABELS_TR, STATE_LABELS_TR } from '../src/core/i18n/tr';
import { formatDateTR, formatCountdownTR, utcDate } from '../src/core/utils/date';
import { formatPercentTR, formatTRY } from '../src/core/utils/money';

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GOLD = '\x1b[38;5;179m';
const GREEN = '\x1b[38;5;42m';
const RED = '\x1b[38;5;203m';
const BLUE = '\x1b[38;5;111m';
const RESET = '\x1b[0m';

function rule(title = ''): void {
  const line = '─'.repeat(Math.max(0, 78 - title.length));
  console.log(`${DIM}${title ? `── ${title} ` : '─'}${line}${RESET}`);
}

function pad(value: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const visible = value.replace(/\x1b\[[0-9;]*m/g, '').length;
  return value + ' '.repeat(Math.max(0, width - visible));
}

function padStart(value: string, width: number): string {
  // eslint-disable-next-line no-control-regex
  const visible = value.replace(/\x1b\[[0-9;]*m/g, '').length;
  return ' '.repeat(Math.max(0, width - visible)) + value;
}

async function main(): Promise<void> {
  // Pinned reference date so the demo output is byte-stable across runs.
  const now = utcDate(2026, 8, 17);
  const provider = new MockBankProvider({ seed: 'subtrack-vip-1071', now, latencyMs: 0 });

  const accounts = provider.getAllAccounts();
  const institutions = await provider.getInstitutions();

  console.log('');
  console.log(`${BOLD}${GOLD}  SubTrack VIP${RESET}${DIM} — Abonelik Tespit Motoru${RESET}`);
  console.log(`${DIM}  Referans tarih: ${formatDateTR(now)}${RESET}`);
  console.log('');

  // ---------------------------------------------------------------------------
  //  1. Provider layer
  // ---------------------------------------------------------------------------
  rule('BANKA SAĞLAYICI KATMANI');
  console.log(
    `  ${institutions.length} kurum destekleniyor, ${accounts.length} hesap bağlı.`,
  );
  for (const account of accounts) {
    console.log(
      `  ${DIM}·${RESET} ${pad(account.institutionName, 18)} ${pad(account.displayName, 22)} ${DIM}${account.maskedNumber}${RESET}  ${padStart(formatTRY(account.balance), 16)}`,
    );
  }
  console.log('');

  // Exercise the real interface rather than the in-memory shortcut, so the demo
  // proves `fetchTransactions` pagination actually works.
  const start = utcDate(2024, 8, 1);
  const collected = [];
  for (const account of accounts) {
    let cursor: string | undefined;
    do {
      const page = await provider.fetchTransactions(account.id, start, now, { limit: 200, cursor });
      collected.push(...page.transactions);
      cursor = page.nextCursor;
    } while (cursor);
  }
  console.log(`  ${collected.length} işlem çekildi (sayfalama ile).`);
  console.log('');

  // ---------------------------------------------------------------------------
  //  2. Detection
  // ---------------------------------------------------------------------------
  const started = process.hrtime.bigint();
  const result = detectSubscriptions({
    transactions: collected,
    engagementSignals: provider.engagementSignals,
    now,
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

  rule('TESPİT MOTORU');
  console.log(
    `  ${result.transactionsScanned} işlem tarandı · ${result.noiseFiltered} gürültü elendi · ` +
      `${result.subscriptions.length} abonelik · ${result.candidates.length} aday · ${elapsedMs.toFixed(1)} ms`,
  );
  console.log('');

  console.log(
    `  ${DIM}${pad('ABONELİK', 30)}${pad('KATEGORİ', 20)}${pad('DÖNGÜ', 10)}${padStart('TUTAR', 13)}${padStart('AYLIK', 13)}${padStart('RİSK', 7)}  DURUM${RESET}`,
  );
  for (const subscription of result.subscriptions) {
    const riskColor =
      subscription.forgottenRiskScore >= 75
        ? RED
        : subscription.forgottenRiskScore >= 50
          ? GOLD
          : GREEN;
    console.log(
      `  ${pad(subscription.merchantName, 30)}` +
        `${DIM}${pad(CATEGORY_LABELS_TR[subscription.category], 20)}${RESET}` +
        `${pad(CYCLE_LABELS_TR[subscription.billingCycle], 10)}` +
        `${padStart(formatTRY(subscription.currentAmount), 13)}` +
        `${padStart(formatTRY(subscription.monthlyEquivalent), 13)}` +
        `${padStart(`${riskColor}${subscription.forgottenRiskScore}${RESET}`, 7)}  ` +
        `${DIM}${STATE_LABELS_TR[subscription.state]}${RESET}`,
    );
  }
  console.log('');

  if (result.candidates.length > 0) {
    console.log(`  ${DIM}Adaylar (eşik altı, kullanıcı onayı bekliyor):${RESET}`);
    for (const candidate of result.candidates) {
      console.log(
        `  ${DIM}·${RESET} ${pad(candidate.merchantName, 30)}${DIM}güven ${(candidate.detectionConfidence * 100).toFixed(0)}%${RESET}`,
      );
    }
    console.log('');
  }

  // ---------------------------------------------------------------------------
  //  3. Scorecard against ground truth
  // ---------------------------------------------------------------------------
  rule('DOĞRULUK KARNESİ');

  const detected = [...result.subscriptions, ...result.candidates];
  const detectedBaseKeys = new Set(detected.map((s) => s.merchantKey.split('::')[0]!));

  const expected = provider.groundTruth.filter((entry) => entry.expectedDetectable);
  const noiseTruth = provider.groundTruth.filter((entry) => entry.kind === 'NOISE');

  /**
   * Apple and Google Play hide every product behind one opaque descriptor. The
   * engine recovers the individual streams by billing anniversary but genuinely
   * cannot name them — so they are graded as "found, unnamed" rather than
   * counted as either a hit or a miss. Pretending otherwise would flatter the
   * scorecard.
   */
  const aggregatorSlots = detected.filter((s) => s.isAggregatorSplit).length;
  const aggregatorExpected = expected.filter(
    (entry) =>
      (entry.channel === 'APPLE_IAP' || entry.channel === 'GOOGLE_PLAY') &&
      !detectedBaseKeys.has(entry.merchantKey),
  );

  const nameable = expected.filter((entry) => !aggregatorExpected.includes(entry));
  const found = nameable.filter((entry) => detectedBaseKeys.has(entry.merchantKey));
  const missed = nameable.filter((entry) => !detectedBaseKeys.has(entry.merchantKey));

  // Strict: ANY detected stream that is not a known subscription is a false
  // positive — including one caused by a misrouted merchant key.
  const expectedKeys = new Set(
    provider.groundTruth.filter((e) => e.kind !== 'NOISE').map((e) => e.merchantKey),
  );
  const falsePositives = detected.filter(
    (s) => !s.isAggregatorSplit && !expectedKeys.has(s.merchantKey.split('::')[0]!),
  );

  const recall = (found.length / Math.max(nameable.length, 1)) * 100;
  const precision =
    (found.length / Math.max(found.length + falsePositives.length, 1)) * 100;

  console.log(
    `  Duyarlılık (recall)  ${found.length}/${nameable.length}  ${recall >= 90 ? GREEN : RED}${recall.toFixed(1)}%${RESET}`,
  );
  console.log(
    `  Kesinlik (precision) ${found.length}/${found.length + falsePositives.length}  ${precision >= 95 ? GREEN : RED}${precision.toFixed(1)}%${RESET}`,
  );
  console.log(
    `  Gürültü reddi        ${noiseTruth.length - falsePositives.length}/${noiseTruth.length} işyeri doğru şekilde yok sayıldı`,
  );
  console.log(
    `  Toplayıcı akışlar    ${aggregatorSlots} akış çözüldü ${DIM}(${aggregatorExpected
      .map((entry) => entry.merchantName)
      .join(', ')} — isim kullanıcıdan alınacak)${RESET}`,
  );

  if (missed.length > 0) {
    console.log(`  ${RED}Kaçırılan:${RESET} ${missed.map((entry) => entry.merchantName).join(', ')}`);
  }
  if (falsePositives.length > 0) {
    console.log(
      `  ${RED}Yanlış pozitif:${RESET} ${falsePositives.map((s) => s.merchantName).join(', ')}`,
    );
  }
  console.log('');

  // ---------------------------------------------------------------------------
  //  4. Analytics
  // ---------------------------------------------------------------------------
  const analytics = buildDashboardAnalytics({
    subscriptions: result.subscriptions,
    transactions: collected,
    now,
  });

  rule('ANALİTİK');
  console.log(
    `  Bu ay          ${padStart(formatTRY(analytics.burnRate.currentMonth), 14)}` +
      `   ${DIM}geçen ay${RESET} ${formatTRY(analytics.burnRate.previousMonth)}` +
      `   ${analytics.burnRate.deltaAmount > 0 ? RED : GREEN}${formatPercentTR(analytics.burnRate.deltaPercent)}${RESET}`,
  );
  console.log(`  Yıllık projeksiyon ${padStart(formatTRY(analytics.projection.projectedAnnual, { whole: true }), 14)}`);
  console.log(
    `  Potansiyel tasarruf ${padStart(`${GREEN}${formatTRY(analytics.savings.potentialAnnualSaving, { whole: true })}${RESET}`, 14)}` +
      `  ${DIM}(${analytics.savings.zombieCount} unutulmuş abonelik)${RESET}`,
  );
  console.log('');

  console.log(`  ${DIM}Kategori dağılımı (aylık):${RESET}`);
  for (const slice of analytics.categoryBreakdown) {
    const bars = '█'.repeat(Math.max(1, Math.round(slice.share * 40)));
    console.log(
      `  ${pad(CATEGORY_LABELS_TR[slice.category], 22)}${padStart(formatTRY(slice.monthlyAmount), 13)}  ${GOLD}${bars}${RESET} ${DIM}%${(slice.share * 100).toFixed(1)}${RESET}`,
    );
  }
  console.log('');

  if (analytics.priceHikeRadar.length > 0) {
    console.log(`  ${DIM}Zam radarı (son 12 ay):${RESET}`);
    for (const hike of analytics.priceHikeRadar) {
      console.log(
        `  ${pad(hike.merchantName, 26)}` +
          `${pad(`${formatTRY(hike.previousAmount)} → ${formatTRY(hike.newAmount)}`, 26)}` +
          `${padStart(`${RED}${formatPercentTR(hike.deltaPercent)}${RESET}`, 10)}` +
          `   ${DIM}ek maliyet ${formatTRY(hike.extraPaidToDate)} · ${formatDateTR(hike.effectiveAt)}${RESET}`,
      );
    }
    console.log('');
  }

  console.log(`  ${DIM}Yaklaşan yenilemeler:${RESET}`);
  for (const renewal of analytics.upcomingRenewals.slice(0, 6)) {
    console.log(
      `  ${pad(renewal.merchantName, 26)}${padStart(formatTRY(renewal.amount), 12)}   ${BLUE}${formatCountdownTR(renewal.renewalAt, now)}${RESET} ${DIM}(${formatDateTR(renewal.renewalAt)})${RESET}`,
    );
  }
  console.log('');

  // ---------------------------------------------------------------------------
  //  5. Alerts
  // ---------------------------------------------------------------------------
  rule('UYARILAR');
  for (const alert of result.alerts.slice(0, 8)) {
    const color =
      alert.severity === 'CRITICAL' ? RED : alert.severity === 'WARNING' ? GOLD : BLUE;
    console.log(`  ${color}●${RESET} ${BOLD}${alert.title}${RESET}`);
    console.log(`    ${DIM}${alert.body}${RESET}`);
  }
  console.log('');

  // Non-zero exit on a regression makes this usable directly in CI.
  if (recall < 85 || precision < 90) {
    console.error(`${RED}  Tespit kalitesi eşiğin altında.${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
