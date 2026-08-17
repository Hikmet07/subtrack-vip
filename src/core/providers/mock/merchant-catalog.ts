/**
 * Simulation catalogue for the mock bank provider.
 *
 * IMPORTANT ARCHITECTURAL NOTE
 * ----------------------------
 * This file is the *ground truth of the simulation*. It is deliberately NOT
 * the same artefact as `core/detection/merchant-dictionary.ts`, which is the
 * production alias dictionary the engine actually uses. Sharing one table
 * between the generator and the detector would make the detection tests
 * self-fulfilling: the engine would "recognise" merchants because it was handed
 * the answer key. Keeping them independent means every descriptor template here
 * is a genuine test of the normaliser.
 *
 * Prices reflect the Turkish market: heavy annual inflation (Netflix TR has
 * roughly tripled in two years), USD-denominated services billed in lira, and
 * utility bills with severe winter seasonality.
 */

import type { BillingChannel, SubscriptionCategory } from '../../types';
import { lira, type Kurus } from '../../utils/money';

export type MockCycleKind = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface MockPricePoint {
  /** How many months before "today" this price took effect. */
  monthsAgo: number;
  amount: Kurus;
}

export interface MockEngagement {
  /** null = never opened since first charge. Drives the zombie risk engine. */
  lastInteractionMonthsAgo: number | null;
  interactionsLast30d: number;
}

export interface MockVariableProfile {
  baseAmount: Kurus;
  /** Peak-to-base seasonal swing. Winter heating bills are brutal. */
  seasonalAmplitude: Kurus;
  /** Month index (0-11) at which the seasonal peak lands. */
  peakMonthIndex: number;
  /** Random month-to-month noise as a fraction of base. */
  noiseRatio: number;
  /** Annual inflation applied to the base, compounded monthly. */
  annualInflation: number;
}

export interface MockNoiseProfile {
  minAmount: Kurus;
  maxAmount: Kurus;
  /** Inclusive range of occurrences per month. */
  perMonth: [number, number];
  /** Some retail spend clusters on paydays / weekends. */
  weekendBias?: number;
}

export interface MockMerchantProfile {
  key: string;
  name: string;
  category: SubscriptionCategory;
  channel: BillingChannel;
  kind: 'SUBSCRIPTION' | 'VARIABLE_BILL' | 'NOISE';

  /**
   * Raw descriptor templates. Placeholders:
   *   {ref}      6-10 digit reference
   *   {short}    4 digit reference
   *   {city}     Turkish city, uppercase
   *   {terminal} POS terminal id
   */
  descriptors: string[];

  cycle?: MockCycleKind;
  priceHistory?: MockPricePoint[];
  /** How many months ago the stream started. */
  startedMonthsAgo?: number;
  /** Month count after which the stream stops (simulates a lapse). */
  endedMonthsAgo?: number;
  /** Preferred day of month for the charge. */
  anchorDay?: number;
  /**
   * USD/EUR-denominated services billed in lira. The charged amount drifts a
   * few percent every month with the exchange rate — the single most common
   * false-positive source for a naive "price hike" detector in Turkey.
   */
  fxLinked?: boolean;
  /** Occasionally skips a month (failed card, grace period). */
  skipProbability?: number;

  engagement?: MockEngagement;
  variable?: MockVariableProfile;
  noise?: MockNoiseProfile;
}

// -----------------------------------------------------------------------------
//  Fixed-price recurring subscriptions
// -----------------------------------------------------------------------------

const SUBSCRIPTIONS: MockMerchantProfile[] = [
  {
    key: 'netflix',
    name: 'Netflix',
    category: 'ENTERTAINMENT',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'POS-NETFLIX.COM/BILL {short} ISTANBUL',
      'NETFLIX.COM {ref} NLD',
      'NETFLIX INTERNATIONAL B.V. AMSTERDAM',
    ],
    cycle: 'MONTHLY',
    anchorDay: 14,
    startedMonthsAgo: 26,
    // Three hikes in two years — the Price Hike Radar's headline case.
    priceHistory: [
      { monthsAgo: 26, amount: lira(176.99) },
      { monthsAgo: 15, amount: lira(229.99) },
      { monthsAgo: 5, amount: lira(299.99) },
    ],
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 18 },
  },
  {
    key: 'spotify',
    name: 'Spotify',
    category: 'MUSIC',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'SPOTIFY AB STOCKHOLM SWE',
      'POS-SPOTIFY P{ref} STOCKHOLM',
      'SPOTIFY {short}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 3,
    startedMonthsAgo: 24,
    // The canonical hike from the product spec: 59,99 -> 99,99 TRY.
    priceHistory: [
      { monthsAgo: 24, amount: lira(59.99) },
      { monthsAgo: 10, amount: lira(99.99) },
    ],
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 26 },
  },
  {
    key: 'youtube-premium',
    name: 'YouTube Premium',
    category: 'ENTERTAINMENT',
    channel: 'GOOGLE_PLAY',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'GOOGLE *YouTube Premium g.co/helppay#',
      'GOOGLE *YOUTUBEPREMIUM {ref}',
      'POS-GOOGLE PAYMENT IE LTD DUBLIN',
    ],
    cycle: 'MONTHLY',
    anchorDay: 22,
    startedMonthsAgo: 19,
    priceHistory: [
      { monthsAgo: 19, amount: lira(79.99) },
      { monthsAgo: 7, amount: lira(119.99) },
    ],
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 31 },
  },
  {
    key: 'icloud',
    name: 'iCloud+',
    category: 'AI_CLOUD',
    channel: 'APPLE_IAP',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'APPLE.COM/BILL ITUNES.COM IRL',
      'POS-APPLE.COM/BILL {short} CORK',
      'APPLE SERVICES {ref} IRL',
    ],
    cycle: 'MONTHLY',
    anchorDay: 8,
    startedMonthsAgo: 30,
    priceHistory: [
      { monthsAgo: 30, amount: lira(39.99) },
      { monthsAgo: 11, amount: lira(49.99) },
      { monthsAgo: 2, amount: lira(64.99) },
    ],
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 4 },
  },
  {
    key: 'chatgpt-plus',
    name: 'ChatGPT Plus',
    category: 'AI_CLOUD',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'OPENAI *CHATGPT SUBSCR HTTPSOPENAI.C',
      'POS-OPENAI, LLC SAN FRANCISCO USA',
      'OPENAI *CHATGPT {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 11,
    startedMonthsAgo: 16,
    // USD 20 billed in TRY: the amount moves every single month.
    fxLinked: true,
    priceHistory: [
      { monthsAgo: 16, amount: lira(712.4) },
      { monthsAgo: 8, amount: lira(784.9) },
      { monthsAgo: 3, amount: lira(842.6) },
    ],
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 44 },
  },
  {
    key: 'amazon-prime',
    name: 'Amazon Prime',
    category: 'ENTERTAINMENT',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'AMAZON TR PRIME UYELIK {ref}',
      'POS-AMAZON.COM.TR ISTANBUL',
      'AMZN Mktp TR*PRIME {short}',
    ],
    // Annual billing — proves the periodicity matrix handles a 365-day cycle
    // from only three data points.
    cycle: 'YEARLY',
    anchorDay: 19,
    startedMonthsAgo: 27,
    priceHistory: [
      { monthsAgo: 27, amount: lira(199.0) },
      { monthsAgo: 15, amount: lira(299.0) },
    ],
    engagement: { lastInteractionMonthsAgo: 2, interactionsLast30d: 1 },
  },
  {
    key: 'gain',
    name: 'Gain',
    category: 'ENTERTAINMENT',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'GAIN MEDYA A.S. ISTANBUL TR',
      'POS-GAIN DIJITAL YAYIN {short} IST',
      'GAIN.TV UYELIK {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 27,
    startedMonthsAgo: 21,
    priceHistory: [
      { monthsAgo: 21, amount: lira(79.9) },
      { monthsAgo: 9, amount: lira(99.9) },
    ],
    // ZOMBIE: paid for 21 months, last opened 11 months ago.
    engagement: { lastInteractionMonthsAgo: 11, interactionsLast30d: 0 },
  },
  {
    key: 'exxen',
    name: 'Exxen',
    category: 'ENTERTAINMENT',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'EXXEN DIJITAL YAYIN HIZ. A.S.',
      'POS-EXXEN {short} ISTANBUL TR',
      'EXXEN.COM ABONELIK {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 6,
    startedMonthsAgo: 18,
    priceHistory: [
      { monthsAgo: 18, amount: lira(129.9) },
      { monthsAgo: 6, amount: lira(169.9) },
    ],
    // ZOMBIE: football season ended, nobody cancelled.
    engagement: { lastInteractionMonthsAgo: 7, interactionsLast30d: 0 },
  },
  {
    key: 'midjourney',
    name: 'Midjourney',
    category: 'AI_CLOUD',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'MIDJOURNEY INC {ref} USA',
      'POS-MIDJOURNEY WILMINGTON DE USA',
      'MIDJOURNEY *SUBSCRIPTION',
    ],
    cycle: 'MONTHLY',
    anchorDay: 17,
    startedMonthsAgo: 14,
    fxLinked: true,
    priceHistory: [
      { monthsAgo: 14, amount: lira(352.8) },
      { monthsAgo: 4, amount: lira(398.5) },
    ],
    // ZOMBIE: signed up for one project, never touched again.
    engagement: { lastInteractionMonthsAgo: null, interactionsLast30d: 0 },
  },
  {
    key: 'adobe-cc',
    name: 'Adobe Creative Cloud',
    category: 'SAAS',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'ADOBE SYSTEMS SOFTWARE IRL {ref}',
      'POS-ADOBE *CREATIVE CLOUD DUBLIN',
      'ADOBE INC. ABONELIK {short}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 24,
    startedMonthsAgo: 23,
    fxLinked: true,
    priceHistory: [
      { monthsAgo: 23, amount: lira(889.0) },
      { monthsAgo: 12, amount: lira(1099.0) },
      { monthsAgo: 1, amount: lira(1289.0) },
    ],
    // ZOMBIE: the most expensive forgotten line on the whole statement.
    engagement: { lastInteractionMonthsAgo: 9, interactionsLast30d: 0 },
  },
  {
    key: 'blutv',
    name: 'BluTV',
    category: 'ENTERTAINMENT',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'BLUTV DIJITAL PLATFORM HIZ.',
      'POS-BLUTV {short} ISTANBUL',
      'BLU TV UYELIK BEDELI {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 12,
    startedMonthsAgo: 22,
    // LAPSED: stopped charging four months ago. The engine must not report it
    // as active, and must not predict a renewal for it.
    endedMonthsAgo: 4,
    priceHistory: [
      { monthsAgo: 22, amount: lira(89.9) },
      { monthsAgo: 12, amount: lira(129.9) },
    ],
    engagement: { lastInteractionMonthsAgo: 5, interactionsLast30d: 0 },
  },
  {
    key: 'disney-plus',
    name: 'Disney+',
    category: 'ENTERTAINMENT',
    channel: 'APPLE_IAP',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'APPLE.COM/BILL ITUNES.COM IRL',
      'POS-APPLE.COM/BILL {short} CORK',
    ],
    cycle: 'MONTHLY',
    // Shares the opaque APPLE.COM/BILL descriptor with iCloud+ (anchored on the
    // 8th). Distinct billing anniversaries are the only thing that lets the
    // aggregator splitter tell the two products apart.
    anchorDay: 21,
    startedMonthsAgo: 13,
    priceHistory: [
      { monthsAgo: 13, amount: lira(134.99) },
      { monthsAgo: 3, amount: lira(164.99) },
    ],
    engagement: { lastInteractionMonthsAgo: 1, interactionsLast30d: 3 },
  },
  {
    key: 'macfit',
    name: 'MACFit',
    category: 'FITNESS',
    channel: 'BANK_STANDING_ORDER',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'OTOMATIK ODEME TALIMATI - MAC FIT SPOR',
      'MACFIT SPOR SALONLARI A.S. TALIMATLI ODEME',
      'DUZENLI ODEME TALIMATI MACFIT {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 1,
    startedMonthsAgo: 20,
    priceHistory: [
      { monthsAgo: 20, amount: lira(949.0) },
      { monthsAgo: 8, amount: lira(1190.0) },
    ],
    // ZOMBIE: the classic. Standing order, gym not visited since winter.
    engagement: { lastInteractionMonthsAgo: 8, interactionsLast30d: 0 },
  },
  {
    key: 'trendyol-premium',
    name: 'Trendyol Premium',
    category: 'FOOD_DELIVERY',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'TRENDYOL PREMIUM UYELIK {ref}',
      'POS-TRENDYOL PREMIUM {short} ISTANBUL',
    ],
    // The trap: the same brand also generates dozens of noise orders. The
    // normaliser must keep "TRENDYOL PREMIUM" and "TRENDYOL SIPARIS" apart.
    cycle: 'QUARTERLY',
    anchorDay: 5,
    startedMonthsAgo: 15,
    priceHistory: [{ monthsAgo: 15, amount: lira(149.0) }],
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 12 },
  },
  {
    key: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'SAAS',
    channel: 'DIRECT_CARD',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'GITHUB *COPILOT {ref} USA',
      'POS-GITHUB INC SAN FRANCISCO',
    ],
    cycle: 'MONTHLY',
    anchorDay: 20,
    startedMonthsAgo: 11,
    fxLinked: true,
    priceHistory: [{ monthsAgo: 11, amount: lira(348.2) }],
    skipProbability: 0.04,
    engagement: { lastInteractionMonthsAgo: 0, interactionsLast30d: 22 },
  },
  {
    key: 'tabii',
    name: 'tabii',
    category: 'ENTERTAINMENT',
    channel: 'CARRIER_BILLING',
    kind: 'SUBSCRIPTION',
    descriptors: [
      'TURKCELL MOBIL ODEME - TABII ABONELIK',
      'MOBIL ODEME TABII {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 28,
    // Only three charges so far — tests the "at least two consecutive
    // intervals" rule at its exact boundary.
    startedMonthsAgo: 3,
    priceHistory: [{ monthsAgo: 3, amount: lira(49.9) }],
    engagement: { lastInteractionMonthsAgo: 1, interactionsLast30d: 2 },
  },
];

// -----------------------------------------------------------------------------
//  Variable bills — recurring but never the same amount twice
// -----------------------------------------------------------------------------

const VARIABLE_BILLS: MockMerchantProfile[] = [
  {
    key: 'turkcell',
    name: 'Turkcell',
    category: 'TELECOM',
    channel: 'BANK_STANDING_ORDER',
    kind: 'VARIABLE_BILL',
    descriptors: [
      'TURKCELL ILETISIM HIZ. A.S. FATURA ODEMESI',
      'OTOMATIK FATURA ODEMESI TURKCELL {ref}',
      'TURKCELL SUPERONLINE FATURA {short}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 15,
    startedMonthsAgo: 24,
    variable: {
      baseAmount: lira(640),
      seasonalAmplitude: lira(60),
      peakMonthIndex: 7,
      noiseRatio: 0.14,
      annualInflation: 0.35,
    },
  },
  {
    key: 'vodafone',
    name: 'Vodafone',
    category: 'TELECOM',
    channel: 'BANK_STANDING_ORDER',
    kind: 'VARIABLE_BILL',
    descriptors: [
      'VODAFONE TELEKOMUNIKASYON A.S. FATURA',
      'OTOMATIK ODEME - VODAFONE {ref}',
    ],
    cycle: 'MONTHLY',
    anchorDay: 21,
    startedMonthsAgo: 24,
    variable: {
      baseAmount: lira(215),
      seasonalAmplitude: lira(25),
      peakMonthIndex: 6,
      noiseRatio: 0.18,
      annualInflation: 0.32,
    },
  },
  {
    key: 'enerjisa',
    name: 'Enerjisa',
    category: 'UTILITIES',
    channel: 'BANK_STANDING_ORDER',
    kind: 'VARIABLE_BILL',
    descriptors: [
      'ENERJISA ELEKTRIK PERAKENDE SATIS A.S.',
      'OTOMATIK ODEME TALIMATI ENERJISA {ref}',
      'ENERJISA ELEKTRIK FATURASI {short} ISTANBUL',
    ],
    cycle: 'MONTHLY',
    anchorDay: 18,
    startedMonthsAgo: 24,
    variable: {
      baseAmount: lira(880),
      // Air-conditioning in August, heating in January: a genuine double peak
      // approximated here with a strong single swing.
      seasonalAmplitude: lira(520),
      peakMonthIndex: 0,
      noiseRatio: 0.16,
      annualInflation: 0.42,
    },
  },
  {
    key: 'iski',
    name: 'İSKİ',
    category: 'UTILITIES',
    channel: 'BANK_STANDING_ORDER',
    kind: 'VARIABLE_BILL',
    descriptors: [
      'ISKI SU FATURASI OTOMATIK ODEME',
      'I.S.K.I. GENEL MUDURLUGU {ref}',
      'ISKI FATURA {short} ISTANBUL',
    ],
    cycle: 'MONTHLY',
    anchorDay: 25,
    startedMonthsAgo: 24,
    variable: {
      baseAmount: lira(238),
      seasonalAmplitude: lira(70),
      peakMonthIndex: 7,
      noiseRatio: 0.2,
      annualInflation: 0.38,
    },
  },
  {
    key: 'igdas',
    name: 'İGDAŞ',
    category: 'UTILITIES',
    channel: 'BANK_STANDING_ORDER',
    kind: 'VARIABLE_BILL',
    descriptors: [
      'IGDAS DOGALGAZ FATURA ODEMESI',
      'OTOMATIK ODEME IGDAS {ref} ISTANBUL',
    ],
    cycle: 'MONTHLY',
    anchorDay: 23,
    startedMonthsAgo: 24,
    variable: {
      // Natural gas in Istanbul: ~₺60 in July, ~₺2.400 in January. Any detector
      // that reads a seasonal swing as a "price hike" will scream here.
      baseAmount: lira(760),
      seasonalAmplitude: lira(1450),
      peakMonthIndex: 0,
      noiseRatio: 0.12,
      annualInflation: 0.45,
    },
  },
];

// -----------------------------------------------------------------------------
//  Noise — everyday retail the engine must ignore
// -----------------------------------------------------------------------------

const NOISE: MockMerchantProfile[] = [
  {
    key: 'trendyol',
    name: 'Trendyol',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: [
      'TRENDYOL* SIPARIS {short}',
      'POS-DSM GRUP DANISMANLIK ILETISIM VE SATIS',
      'TRENDYOL SIPARIS {ref} ISTANBUL',
    ],
    noise: { minAmount: lira(89), maxAmount: lira(4200), perMonth: [2, 7] },
  },
  {
    key: 'getir',
    name: 'Getir',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: [
      'GETIR PERAKENDE TIC. A.S. ISTANBUL TR',
      'POS-GETIR {terminal} ISTANBUL',
      'GETIRBUYUK {short}',
    ],
    noise: { minAmount: lira(65), maxAmount: lira(890), perMonth: [4, 12] },
  },
  {
    key: 'migros',
    name: 'Migros',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: [
      'MIGROS TICARET A.S. {terminal} ISTANBUL',
      'POS-MIGROS {short} KADIKOY',
      'MIGROS SANAL MARKET {ref}',
    ],
    noise: { minAmount: lira(120), maxAmount: lira(3100), perMonth: [3, 8] },
  },
  {
    key: 'starbucks',
    name: 'Starbucks',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: [
      'STARBUCKS COFFEE {terminal} ISTANBUL',
      'POS-SHAYA MAGAZACILIK A.S. {short}',
    ],
    noise: { minAmount: lira(95), maxAmount: lira(420), perMonth: [2, 9], weekendBias: 0.35 },
  },
  {
    key: 'a101',
    name: 'A101',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: ['A101 YENI MAGAZACILIK A.S. {terminal}', 'POS-A101 {short} ISTANBUL'],
    noise: { minAmount: lira(48), maxAmount: lira(1250), perMonth: [2, 6] },
  },
  {
    key: 'yemeksepeti',
    name: 'Yemeksepeti',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: ['YEMEKSEPETI ELEKTRONIK {ref}', 'POS-YEMEKSEPETI.COM {short}'],
    noise: { minAmount: lira(180), maxAmount: lira(1450), perMonth: [1, 6], weekendBias: 0.4 },
  },
  {
    key: 'opet',
    name: 'Opet',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: ['OPET PETROLCULUK A.S. {terminal}', 'POS-OPET {short} ISTANBUL'],
    noise: { minAmount: lira(900), maxAmount: lira(3400), perMonth: [1, 3] },
  },
  {
    key: 'bitaksi',
    name: 'BiTaksi',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: ['BITAKSI MOBIL TEKNOLOJILER {short}', 'POS-BITAKSI {ref}'],
    noise: { minAmount: lira(110), maxAmount: lira(760), perMonth: [2, 10] },
  },
  {
    key: 'local-pos',
    name: 'Yerel Restoran',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    // Independent merchants: the messiest descriptors on any Turkish statement.
    descriptors: [
      'POS-MEHMET USTA KEBAP SALONU {terminal} {city}',
      'POS-CIGKOFTECI ALI USTA {short} {city}',
      'KAHVE DUNYASI {terminal} {city}',
      'POS-BIG CHEFS RESTORAN ISLETMECILIK {short}',
      'POS-BALIKCI SABAHATTIN {terminal} FATIH',
      'ARZU HANIM PASTANESI {short} {city}',
      'POS-OZSUT {terminal} {city}',
    ],
    noise: { minAmount: lira(220), maxAmount: lira(2800), perMonth: [3, 11], weekendBias: 0.45 },
  },
  {
    key: 'watsons',
    name: 'Watsons',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: ['WATSONS GUZELLIK VE BAKIM {terminal}', 'POS-WATSONS {short} {city}'],
    noise: { minAmount: lira(140), maxAmount: lira(1600), perMonth: [0, 3] },
  },
  {
    key: 'vatan',
    name: 'Vatan Bilgisayar',
    category: 'OTHER',
    channel: 'DIRECT_CARD',
    kind: 'NOISE',
    descriptors: ['VATAN BILGISAYAR SAN. TIC. {ref}', 'POS-VATAN COMPUTER {short}'],
    // Deliberately low frequency and wildly varying: a naive detector that only
    // looks at "roughly monthly" intervals will try to classify this.
    noise: { minAmount: lira(700), maxAmount: lira(38000), perMonth: [0, 1] },
  },
];

export const MOCK_MERCHANTS: MockMerchantProfile[] = [
  ...SUBSCRIPTIONS,
  ...VARIABLE_BILLS,
  ...NOISE,
];

export const MOCK_SUBSCRIPTION_MERCHANTS = SUBSCRIPTIONS;
export const MOCK_VARIABLE_BILL_MERCHANTS = VARIABLE_BILLS;
export const MOCK_NOISE_MERCHANTS = NOISE;

export const TURKISH_CITIES = [
  'ISTANBUL',
  'ANKARA',
  'IZMIR',
  'BURSA',
  'ANTALYA',
  'KOCAELI',
  'ESKISEHIR',
] as const;
