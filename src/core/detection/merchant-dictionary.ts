/**
 * Production merchant dictionary for the Turkish market.
 *
 * This is the engine's *own* knowledge base — deliberately authored
 * independently of the mock catalogue, so recognising a simulated descriptor is
 * a genuine test of the normaliser rather than a lookup of the answer key.
 *
 * Entries carry three kinds of signal:
 *   1. identity   — which brand is this?
 *   2. behaviour  — is the amount allowed to vary? is it retail noise?
 *   3. billing    — which rail pulls the money, i.e. how do you cancel it?
 *
 * `aliases` and `patterns` are matched against the *cleaned* descriptor. They
 * are written here in natural form ("APPLE.COM/BILL") and pushed through the
 * very same cleaning pipeline at index-build time, so the dictionary author
 * never has to think in post-normalisation punctuation.
 */

import type { BillingChannel, SubscriptionCategory } from '../types';

export interface MerchantDefinition {
  key: string;
  displayName: string;
  category: SubscriptionCategory;
  /** Substring matches against the cleaned descriptor. Longest wins. */
  aliases: string[];
  /** Applied against the cleaned descriptor when aliases are not enough. */
  patterns?: RegExp[];
  channelHint?: BillingChannel;
  /**
   * Everyday retail. Can never be promoted to a subscription, no matter how
   * regular the intervals happen to look.
   */
  retailNoise?: boolean;
  /** Recurring, but the amount legitimately changes every period. */
  variableAmount?: boolean;
  /**
   * Billing aggregators. A single descriptor covers many unrelated products,
   * so a matched stream must be split before it can be analysed.
   * See `splitAggregatorStreams` in periodicity.ts.
   */
  isAggregator?: boolean;
  /** Home page / account page, used by the cancellation guides. */
  website?: string;
}

export const MERCHANT_DEFINITIONS: MerchantDefinition[] = [
  // ---------------------------------------------------------------------------
  //  Streaming & entertainment
  // ---------------------------------------------------------------------------
  {
    key: 'netflix',
    displayName: 'Netflix',
    category: 'ENTERTAINMENT',
    aliases: ['NETFLIX'],
    patterns: [/\bNETFLIX\b/],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.netflix.com/tr/youraccount',
  },
  {
    key: 'exxen',
    displayName: 'Exxen',
    category: 'ENTERTAINMENT',
    aliases: ['EXXEN'],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.exxen.com/hesabim',
  },
  {
    key: 'blutv',
    displayName: 'BluTV',
    category: 'ENTERTAINMENT',
    aliases: ['BLUTV', 'BLU TV'],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.blutv.com/hesabim',
  },
  {
    key: 'gain',
    displayName: 'Gain',
    category: 'ENTERTAINMENT',
    aliases: ['GAIN MEDYA', 'GAIN.TV', 'GAIN DIJITAL'],
    channelHint: 'DIRECT_CARD',
    website: 'https://gain.tv',
  },
  {
    key: 'tabii',
    displayName: 'tabii',
    category: 'ENTERTAINMENT',
    aliases: ['TABII'],
    channelHint: 'CARRIER_BILLING',
    website: 'https://www.tabii.com',
  },
  {
    key: 'disney-plus',
    displayName: 'Disney+',
    category: 'ENTERTAINMENT',
    aliases: ['DISNEY PLUS', 'DISNEYPLUS', 'DISNEY+'],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.disneyplus.com/tr-tr/account',
  },
  {
    key: 'amazon-prime',
    displayName: 'Amazon Prime',
    category: 'ENTERTAINMENT',
    aliases: ['AMAZON TR PRIME', 'PRIME UYELIK', 'AMZN MKTP TR PRIME', 'AMAZON.COM.TR'],
    patterns: [/AMAZON.*PRIME/],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.amazon.com.tr/gp/primecentral',
  },
  {
    key: 'youtube-premium',
    displayName: 'YouTube Premium',
    category: 'ENTERTAINMENT',
    aliases: ['YOUTUBE PREMIUM', 'YOUTUBEPREMIUM', 'YOUTUBE MUSIC'],
    channelHint: 'GOOGLE_PLAY',
    website: 'https://www.youtube.com/paid_memberships',
  },

  // ---------------------------------------------------------------------------
  //  Music
  // ---------------------------------------------------------------------------
  {
    key: 'spotify',
    displayName: 'Spotify',
    category: 'MUSIC',
    aliases: ['SPOTIFY'],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.spotify.com/tr/account/subscription/',
  },
  {
    key: 'fizy',
    displayName: 'fizy',
    category: 'MUSIC',
    aliases: ['FIZY'],
    channelHint: 'CARRIER_BILLING',
  },

  // ---------------------------------------------------------------------------
  //  AI & cloud
  // ---------------------------------------------------------------------------
  {
    key: 'chatgpt-plus',
    displayName: 'ChatGPT Plus',
    category: 'AI_CLOUD',
    aliases: ['OPENAI', 'CHATGPT'],
    patterns: [/OPENAI/],
    channelHint: 'DIRECT_CARD',
    website: 'https://chat.openai.com/#settings/Subscription',
  },
  {
    key: 'claude-pro',
    displayName: 'Claude Pro',
    category: 'AI_CLOUD',
    aliases: ['ANTHROPIC', 'CLAUDE.AI'],
    channelHint: 'DIRECT_CARD',
  },
  {
    key: 'midjourney',
    displayName: 'Midjourney',
    category: 'AI_CLOUD',
    aliases: ['MIDJOURNEY'],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.midjourney.com/account/',
  },
  {
    key: 'icloud',
    displayName: 'iCloud+',
    category: 'AI_CLOUD',
    aliases: ['ICLOUD'],
    channelHint: 'APPLE_IAP',
  },
  {
    key: 'google-one',
    displayName: 'Google One',
    category: 'AI_CLOUD',
    aliases: ['GOOGLE ONE', 'GOOGLE STORAGE'],
    channelHint: 'GOOGLE_PLAY',
  },

  // ---------------------------------------------------------------------------
  //  SaaS & productivity
  // ---------------------------------------------------------------------------
  {
    key: 'adobe-cc',
    displayName: 'Adobe Creative Cloud',
    category: 'SAAS',
    aliases: ['ADOBE'],
    patterns: [/ADOBE\s*(SYSTEMS|INC)?/],
    channelHint: 'DIRECT_CARD',
    website: 'https://account.adobe.com/plans',
  },
  {
    key: 'github-copilot',
    displayName: 'GitHub Copilot',
    category: 'SAAS',
    aliases: ['GITHUB'],
    channelHint: 'DIRECT_CARD',
    website: 'https://github.com/settings/billing',
  },
  {
    key: 'notion',
    displayName: 'Notion',
    category: 'SAAS',
    aliases: ['NOTION LABS', 'NOTION.SO'],
    channelHint: 'DIRECT_CARD',
  },
  {
    key: 'microsoft-365',
    displayName: 'Microsoft 365',
    category: 'SAAS',
    aliases: ['MICROSOFT 365', 'MSFT 365', 'MICROSOFT OFFICE'],
    channelHint: 'DIRECT_CARD',
  },

  // ---------------------------------------------------------------------------
  //  Fitness
  // ---------------------------------------------------------------------------
  {
    key: 'macfit',
    displayName: 'MACFit',
    category: 'FITNESS',
    aliases: ['MACFIT', 'MAC FIT', 'MAC SPOR'],
    channelHint: 'BANK_STANDING_ORDER',
  },
  {
    key: 'fitness-time',
    displayName: 'Fitness Time',
    category: 'FITNESS',
    aliases: ['FITNESS TIME'],
    channelHint: 'BANK_STANDING_ORDER',
  },

  // ---------------------------------------------------------------------------
  //  Telecom & utilities — recurring, but the amount moves every month
  // ---------------------------------------------------------------------------
  {
    key: 'turkcell',
    displayName: 'Turkcell',
    category: 'TELECOM',
    aliases: ['TURKCELL', 'SUPERONLINE'],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },
  {
    key: 'vodafone',
    displayName: 'Vodafone',
    category: 'TELECOM',
    aliases: ['VODAFONE'],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },
  {
    key: 'turk-telekom',
    displayName: 'Türk Telekom',
    category: 'TELECOM',
    aliases: ['TURK TELEKOM', 'TTNET'],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },
  {
    key: 'enerjisa',
    displayName: 'Enerjisa',
    category: 'UTILITIES',
    aliases: ['ENERJISA'],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },
  {
    key: 'iski',
    displayName: 'İSKİ',
    category: 'UTILITIES',
    aliases: ['ISKI', 'I.S.K.I'],
    patterns: [/\bISKI\b/],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },
  {
    key: 'igdas',
    displayName: 'İGDAŞ',
    category: 'UTILITIES',
    aliases: ['IGDAS'],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },
  {
    key: 'aski',
    displayName: 'ASKİ',
    category: 'UTILITIES',
    aliases: ['ASKI GENEL MUDURLUGU'],
    channelHint: 'BANK_STANDING_ORDER',
    variableAmount: true,
  },

  // ---------------------------------------------------------------------------
  //  Marketplace memberships — same brand as high-volume retail noise
  // ---------------------------------------------------------------------------
  {
    key: 'trendyol-premium',
    displayName: 'Trendyol Premium',
    category: 'FOOD_DELIVERY',
    // Listed before the `trendyol` noise entry and matched longest-first, so
    // "TRENDYOL PREMIUM UYELIK" never falls through to the noise definition.
    aliases: ['TRENDYOL PREMIUM'],
    channelHint: 'DIRECT_CARD',
    website: 'https://www.trendyol.com/hesabim/premium',
  },
  {
    key: 'getir-plus',
    displayName: 'Getir+',
    category: 'FOOD_DELIVERY',
    // "GETIR+" is deliberately absent: punctuation is stripped during cleaning,
    // so it would collapse to "GETIR" and swallow every grocery order. The
    // membership is only ever identifiable by the explicit "PLUS" token.
    aliases: ['GETIR PLUS'],
    channelHint: 'DIRECT_CARD',
  },

  // ---------------------------------------------------------------------------
  //  Billing aggregators — one descriptor, many products
  // ---------------------------------------------------------------------------
  {
    key: 'apple',
    displayName: 'Apple',
    category: 'OTHER',
    aliases: ['APPLE.COM/BILL', 'APPLE SERVICES', 'ITUNES.COM', 'APPLE.COM BILL'],
    patterns: [/\bAPPLE\s+COM\b/, /\bITUNES\b/],
    channelHint: 'APPLE_IAP',
    isAggregator: true,
    website: 'https://apps.apple.com/account/subscriptions',
  },
  {
    key: 'google-play',
    displayName: 'Google Play',
    category: 'OTHER',
    aliases: ['GOOGLE PAYMENT', 'GOOGLE PLAY', 'G.CO/HELPPAY'],
    channelHint: 'GOOGLE_PLAY',
    isAggregator: true,
    website: 'https://play.google.com/store/account/subscriptions',
  },

  // ---------------------------------------------------------------------------
  //  Retail noise — explicitly excluded from subscription detection
  // ---------------------------------------------------------------------------
  {
    key: 'trendyol',
    displayName: 'Trendyol',
    category: 'OTHER',
    aliases: ['TRENDYOL', 'DSM GRUP'],
    retailNoise: true,
  },
  { key: 'getir', displayName: 'Getir', category: 'OTHER', aliases: ['GETIR', 'GETIRBUYUK'], retailNoise: true },
  { key: 'migros', displayName: 'Migros', category: 'OTHER', aliases: ['MIGROS'], retailNoise: true },
  { key: 'a101', displayName: 'A101', category: 'OTHER', aliases: ['A101'], retailNoise: true },
  { key: 'bim', displayName: 'BİM', category: 'OTHER', aliases: ['BIM BIRLESIK'], retailNoise: true },
  { key: 'sok', displayName: 'ŞOK', category: 'OTHER', aliases: ['SOK MARKETLER'], retailNoise: true },
  {
    key: 'starbucks',
    displayName: 'Starbucks',
    category: 'OTHER',
    aliases: ['STARBUCKS', 'SHAYA MAGAZACILIK'],
    retailNoise: true,
  },
  {
    key: 'yemeksepeti',
    displayName: 'Yemeksepeti',
    category: 'OTHER',
    aliases: ['YEMEKSEPETI'],
    retailNoise: true,
  },
  { key: 'opet', displayName: 'Opet', category: 'OTHER', aliases: ['OPET'], retailNoise: true },
  { key: 'shell', displayName: 'Shell', category: 'OTHER', aliases: ['SHELL PETROL'], retailNoise: true },
  { key: 'bitaksi', displayName: 'BiTaksi', category: 'OTHER', aliases: ['BITAKSI'], retailNoise: true },
  {
    key: 'kahve-dunyasi',
    displayName: 'Kahve Dünyası',
    category: 'OTHER',
    aliases: ['KAHVE DUNYASI'],
    retailNoise: true,
  },
  {
    key: 'watsons',
    displayName: 'Watsons',
    category: 'OTHER',
    aliases: ['WATSONS'],
    retailNoise: true,
  },
  {
    key: 'vatan-bilgisayar',
    displayName: 'Vatan Bilgisayar',
    category: 'OTHER',
    aliases: ['VATAN BILGISAYAR', 'VATAN COMPUTER'],
    retailNoise: true,
  },
  {
    key: 'big-chefs',
    displayName: 'Big Chefs',
    category: 'OTHER',
    aliases: ['BIG CHEFS'],
    retailNoise: true,
  },
  { key: 'ozsut', displayName: 'Özsüt', category: 'OTHER', aliases: ['OZSUT'], retailNoise: true },
];

/**
 * Category-level fallbacks for merchants absent from the dictionary.
 * Keyed by a token that, if present in the cleaned descriptor, is a strong
 * signal of what kind of business it is. This is what keeps an unknown local
 * kebab shop out of the subscription list.
 */
export const CATEGORY_KEYWORDS: Array<{
  keywords: string[];
  category: SubscriptionCategory;
  retailNoise: boolean;
}> = [
  {
    keywords: [
      'KEBAP',
      'RESTORAN',
      'RESTAURANT',
      'LOKANTA',
      'PASTANE',
      'PASTANESI',
      'CAFE',
      'KAFE',
      'CIGKOFTE',
      'CIGKOFTECI',
      'BALIKCI',
      'PIDE',
      'DONER',
      'BURGER',
      'PIZZA',
      'FIRIN',
      'BUFE',
      'MANGAL',
      'MEYHANE',
      'KAHVALTI',
    ],
    category: 'OTHER',
    retailNoise: true,
  },
  {
    keywords: ['MARKET', 'MAGAZA', 'MAGAZACILIK', 'GIDA', 'BAKKAL', 'MANAV', 'PETROL', 'AKARYAKIT'],
    category: 'OTHER',
    retailNoise: true,
  },
  {
    keywords: ['ECZANE', 'ECZANESI', 'HASTANE', 'POLIKLINIK', 'DIS HEKIMI'],
    category: 'OTHER',
    retailNoise: true,
  },
  {
    keywords: ['SPOR SALONU', 'FITNESS', 'GYM', 'PILATES', 'YOGA'],
    category: 'FITNESS',
    retailNoise: false,
  },
  {
    keywords: ['SIGORTA', 'KASKO', 'DASK', 'BES ', 'BIREYSEL EMEKLILIK'],
    category: 'INSURANCE',
    retailNoise: false,
  },
  {
    keywords: ['ELEKTRIK', 'DOGALGAZ', 'SU FATURASI', 'FATURA ODEMESI'],
    category: 'UTILITIES',
    retailNoise: false,
  },
];

export const MERCHANTS_BY_KEY = new Map(
  MERCHANT_DEFINITIONS.map((definition) => [definition.key, definition]),
);
