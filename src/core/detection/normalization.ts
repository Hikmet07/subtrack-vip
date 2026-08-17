/**
 * Merchant normalisation.
 *
 * Turkish bank statements are among the noisiest in Europe. A single Netflix
 * charge can arrive as any of:
 *
 *     POS-NETFLIX.COM/BILL 1234 ISTANBUL
 *     NETFLIX.COM 8665797172 NLD
 *     NETFLIX INTERNATIONAL B.V. AMSTERDAM
 *
 * The pipeline below turns all three into `{ merchantKey: "netflix" }` while
 * keeping the original descriptor untouched for audit. Order of operations is
 * load-bearing:
 *
 *   1. fold Turkish characters   (İ/ı/Ş/Ğ/Ü/Ö/Ç -> ASCII)
 *   2. detect the billing channel  <- must happen BEFORE prefixes are stripped,
 *                                     because the prefix IS the channel signal
 *   3. strip channel/rail prefixes ("POS-", "GOOGLE *", "OTOMATIK ODEME TALİMATI - ")
 *   4. strip references, terminals, cities, country codes, legal suffixes
 *   5. match: user override -> exact alias -> regex -> token -> fuzzy bigram
 */

import type {
  BillingChannel,
  MerchantMatchStrategy,
  SubscriptionCategory,
} from '../types';
import { diceCoefficient } from '../utils/stats';
import {
  CATEGORY_KEYWORDS,
  MERCHANT_DEFINITIONS,
  type MerchantDefinition,
} from './merchant-dictionary';

// -----------------------------------------------------------------------------
//  1. Character folding
// -----------------------------------------------------------------------------

const TURKISH_FOLD_MAP: Record<string, string> = {
  İ: 'I',
  I: 'I',
  ı: 'I',
  i: 'I',
  Ş: 'S',
  ş: 'S',
  Ğ: 'G',
  ğ: 'G',
  Ü: 'U',
  ü: 'U',
  Ö: 'O',
  ö: 'O',
  Ç: 'C',
  ç: 'C',
  Â: 'A',
  â: 'A',
  Î: 'I',
  î: 'I',
  Û: 'U',
  û: 'U',
};

/**
 * Folds Turkish characters to ASCII *before* uppercasing.
 *
 * This ordering is not cosmetic. JavaScript's locale-independent
 * `toUpperCase()` maps "i" to "I" — correct for us — but a `tr-TR` locale
 * uppercase would map it to "İ", and any downstream ASCII comparison would then
 * silently fail. Folding first removes the ambiguity entirely.
 */
export function foldTurkish(input: string): string {
  let out = '';
  for (const char of input) out += TURKISH_FOLD_MAP[char] ?? char;
  return out.toUpperCase();
}

// -----------------------------------------------------------------------------
//  2. Billing channel detection
// -----------------------------------------------------------------------------

const CHANNEL_PATTERNS: Array<{ channel: BillingChannel; pattern: RegExp }> = [
  // Standing orders first: an "OTOMATİK ÖDEME TALİMATI" line may also mention a
  // card, and the mandate is what actually has to be cancelled.
  {
    channel: 'BANK_STANDING_ORDER',
    pattern: /OTOMATIK\s+(ODEME|FATURA)|TALIMATLI\s+ODEME|DUZENLI\s+ODEME\s+TALIMATI|ODEME\s+TALIMATI/,
  },
  { channel: 'CARRIER_BILLING', pattern: /MOBIL\s+ODEME|FATURAYA\s+YANSIT/ },
  { channel: 'APPLE_IAP', pattern: /APPLE\.?\s?COM\/?\s?BILL|ITUNES\.?\s?COM|APPLE\s+SERVICES/ },
  { channel: 'GOOGLE_PLAY', pattern: /GOOGLE\s*\*|GOOGLE\s+PAYMENT|G\.CO\/HELPPAY|PLAY\s+STORE/ },
  { channel: 'WALLET', pattern: /\bPAPARA\b|\bPAYCELL\b/ },
  { channel: 'DIRECT_CARD', pattern: /^POS[-\s]|SANALPOS|E-TICARET|\bKK\b/ },
];

export function detectBillingChannel(foldedDescriptor: string): BillingChannel {
  for (const { channel, pattern } of CHANNEL_PATTERNS) {
    if (pattern.test(foldedDescriptor)) return channel;
  }
  return 'UNKNOWN';
}

// -----------------------------------------------------------------------------
//  3 & 4. Cleaning
// -----------------------------------------------------------------------------

/** Rail / channel prefixes. Anchored — only stripped from the start. */
const PREFIX_PATTERNS: RegExp[] = [
  /^POS[-\s]+/,
  /^SANALPOS[-\s]+/,
  /^(IB|MOB|ATM|KK|EFT|FAST|HAVALE)[-\s]+/,
  /^ONLINE\s+ODEME[-\s]+/,
  /^E-?TICARET[-\s]+/,
  /^IADE[-\s]+/, // refund marker
  /^GOOGLE\s*\*\s*/,
  /^AMZN\s+MKTP\s+TR\s*\*\s*/,
  /^(SQ|SP|PAYPAL|PP)\s*\*\s*/,
  /^[A-Z]*\s*MOBIL\s+ODEME\s*[-:]?\s*/,
  /^OTOMATIK\s+(ODEME\s+TALIMATI|FATURA\s+ODEMESI|ODEME)\s*[-:]?\s*/,
  /^DUZENLI\s+ODEME\s+TALIMATI\s*[-:]?\s*/,
  /^TALIMATLI\s+ODEME\s*[-:]?\s*/,
];

/** Rail suffixes that arrive at the end instead of the start. */
const SUFFIX_PATTERNS: RegExp[] = [
  /\s+OTOMATIK\s+ODEME(SI)?$/,
  /\s+TALIMATLI\s+ODEME$/,
  /\s+FATURA\s+ODEMESI$/,
  /\s+ODEME(SI)?$/,
];

/** Corporate boilerplate that carries no identity. */
const LEGAL_TOKENS = new Set([
  'AS',
  'A.S',
  'LTD',
  'STI',
  'TIC',
  'TICARET',
  'SAN',
  'SANAYI',
  'VE',
  'INC',
  'LLC',
  'BV',
  'B.V',
  'AB',
  'GMBH',
  'PLC',
  'CO',
  'HIZ',
  'HIZMETLERI',
  'PERAKENDE',
  'SATIS',
  'DANISMANLIK',
  'ISLETMECILIK',
  'MAGAZACILIK',
  'GRUP',
  'GENEL',
  'MUDURLUGU',
  'ELEKTRONIK',
  'TEKNOLOJILER',
  'TELEKOMUNIKASYON',
  'DIJITAL',
  'PLATFORM',
  'YAYIN',
  'MEDYA',
  'UYELIK',
  'ABONELIK',
  'BEDELI',
  'FATURA',
  'FATURASI',
  'SIPARIS',
  'SUBSCR',
  'SUBSCRIPTION',
  'COM',
  'NET',
  'WWW',
  'BILL',
  'HELPPAY',
  'INTERNATIONAL',
]);

/** Cities appended by acquirers. Dropped only when they are not the whole name. */
const CITY_TOKENS = new Set([
  'ISTANBUL',
  'ANKARA',
  'IZMIR',
  'BURSA',
  'ANTALYA',
  'KOCAELI',
  'ESKISEHIR',
  'KADIKOY',
  'FATIH',
  'BESIKTAS',
  'SISLI',
  'AMSTERDAM',
  'STOCKHOLM',
  'DUBLIN',
  'CORK',
  'LONDON',
  'WILMINGTON',
  'SAN',
  'FRANCISCO',
  'GATOS',
  'LUXEMBOURG',
]);

const COUNTRY_TOKENS = new Set([
  'TR',
  'TUR',
  'NL',
  'NLD',
  'IE',
  'IRL',
  'US',
  'USA',
  'GB',
  'GBR',
  'SE',
  'SWE',
  'LU',
  'LUX',
  'DE',
  'DEU',
  'FR',
  'FRA',
]);

/**
 * Reduces a raw descriptor to its identity core.
 * Idempotent: cleaning an already-clean string returns it unchanged, which is
 * what lets dictionary aliases be pushed through the same function.
 */
export function cleanDescriptor(raw: string): string {
  let text = foldTurkish(raw);

  for (const pattern of PREFIX_PATTERNS) text = text.replace(pattern, '');
  for (const pattern of SUFFIX_PATTERNS) text = text.replace(pattern, '');

  // Punctuation becomes whitespace so "NETFLIX.COM/BILL" tokenises cleanly.
  text = text.replace(/[.,*/#&()[\]:;_+'"|\\-]+/g, ' ');
  // Drop URL fragments and long reference numbers.
  text = text.replace(/\bHTTPS?[A-Z0-9]*/g, ' ');
  text = text.replace(/\bTR\d{3,}\b/g, ' ');
  text = text.replace(/\b\d{3,}\b/g, ' ');

  let tokens = text.split(/\s+/).filter(Boolean);

  // Strip trailing country codes, then trailing cities and legal boilerplate.
  while (tokens.length > 1 && COUNTRY_TOKENS.has(tokens[tokens.length - 1]!)) tokens.pop();
  tokens = tokens.filter((token) => !LEGAL_TOKENS.has(token));
  // Only remove a city when something identifying survives it.
  const withoutCities = tokens.filter((token) => !CITY_TOKENS.has(token));
  if (withoutCities.length > 0) tokens = withoutCities;
  // A lone digit-ish leftover is not an identity.
  tokens = tokens.filter((token) => token.length > 1 || /[A-Z]/.test(token));

  return tokens.join(' ').trim();
}

// -----------------------------------------------------------------------------
//  Alias index — built by pushing dictionary aliases through `cleanDescriptor`
// -----------------------------------------------------------------------------

interface AliasEntry {
  alias: string;
  definition: MerchantDefinition;
}

/**
 * Builds the alias index, longest cleaned alias first so "TRENDYOL PREMIUM"
 * outranks "TRENDYOL".
 *
 * Collision guard: cleaning is lossy, so two dictionary entries can converge on
 * the same token ("GETIR+" and "GETIR" both clean to "GETIR"). When that
 * happens the retail-noise definition wins. This is an asymmetric-cost
 * decision, not a coin toss: labelling a grocery run as a subscription puts a
 * phantom charge on the user's dashboard and destroys trust, while missing a
 * genuine membership merely leaves it in the candidate list for confirmation.
 */
function buildAliasIndex(): AliasEntry[] {
  const byAlias = new Map<string, MerchantDefinition[]>();

  for (const definition of MERCHANT_DEFINITIONS) {
    for (const rawAlias of definition.aliases) {
      const alias = cleanDescriptor(rawAlias);
      if (alias.length === 0) continue;
      const bucket = byAlias.get(alias);
      if (bucket) bucket.push(definition);
      else byAlias.set(alias, [definition]);
    }
  }

  const entries: AliasEntry[] = [];
  for (const [alias, definitions] of byAlias) {
    const winner =
      definitions.length === 1
        ? definitions[0]!
        : definitions.find((definition) => definition.retailNoise) ?? definitions[0]!;
    entries.push({ alias, definition: winner });
  }

  return entries.sort((a, b) => b.alias.length - a.alias.length);
}

const ALIAS_INDEX: AliasEntry[] = buildAliasIndex();

// -----------------------------------------------------------------------------
//  5. Matching
// -----------------------------------------------------------------------------

/** Tenant-level correction. Always beats the dictionary. */
export interface MerchantOverrideRule {
  descriptorPattern: string;
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  channel?: BillingChannel;
  forceIgnore?: boolean;
}

export interface NormalizedMerchant {
  merchantKey: string;
  merchantName: string;
  category: SubscriptionCategory;
  channel: BillingChannel;
  confidence: number;
  strategy: MerchantMatchStrategy;
  cleanedDescriptor: string;
  isNoise: boolean;
  isAggregator: boolean;
  variableAmount: boolean;
}

const FUZZY_THRESHOLD = 0.82;

export function normalizeMerchant(
  rawDescriptor: string,
  overrides: MerchantOverrideRule[] = [],
): NormalizedMerchant {
  const folded = foldTurkish(rawDescriptor);
  const channelFromDescriptor = detectBillingChannel(folded);
  const cleaned = cleanDescriptor(rawDescriptor);

  // --- 5a. User overrides -----------------------------------------------------
  for (const override of overrides) {
    if (folded.includes(foldTurkish(override.descriptorPattern))) {
      return {
        merchantKey: override.merchantKey,
        merchantName: override.merchantName,
        category: override.category,
        channel: override.channel ?? channelFromDescriptor,
        confidence: 1,
        strategy: 'USER_OVERRIDE',
        cleanedDescriptor: cleaned,
        isNoise: override.forceIgnore ?? false,
        isAggregator: false,
        variableAmount: false,
      };
    }
  }

  // --- 5b. Exact / substring alias -------------------------------------------
  for (const { alias, definition } of ALIAS_INDEX) {
    if (cleaned === alias) return build(definition, cleaned, channelFromDescriptor, 0.99, 'EXACT_ALIAS');
    if (containsPhrase(cleaned, alias)) {
      return build(definition, cleaned, channelFromDescriptor, 0.94, 'TOKEN_CONTAINS');
    }
  }

  // --- 5c. Regex patterns -----------------------------------------------------
  for (const definition of MERCHANT_DEFINITIONS) {
    if (!definition.patterns) continue;
    if (definition.patterns.some((pattern) => pattern.test(cleaned))) {
      return build(definition, cleaned, channelFromDescriptor, 0.9, 'REGEX_ALIAS');
    }
  }

  // --- 5d. Fuzzy bigram on the leading tokens ---------------------------------
  // Brands sit at the front of a descriptor; comparing the whole string would
  // let trailing boilerplate dominate the coefficient.
  const head = cleaned.split(' ').slice(0, 2).join(' ');
  let bestScore = 0;
  let bestDefinition: MerchantDefinition | undefined;

  for (const { alias, definition } of ALIAS_INDEX) {
    const score = Math.max(diceCoefficient(head, alias), diceCoefficient(cleaned, alias));
    if (score > bestScore) {
      bestScore = score;
      bestDefinition = definition;
    }
  }

  if (bestDefinition && bestScore >= FUZZY_THRESHOLD) {
    return build(bestDefinition, cleaned, channelFromDescriptor, bestScore * 0.9, 'FUZZY_BIGRAM');
  }

  // --- 5e. Unresolved: fall back to keyword-based categorisation --------------
  const keywordHit = CATEGORY_KEYWORDS.find((entry) =>
    entry.keywords.some((keyword) => cleaned.includes(keyword)),
  );

  const fallbackName = titleCaseTR(cleaned.split(' ').slice(0, 3).join(' ')) || 'Bilinmeyen İşyeri';

  return {
    merchantKey: slugify(cleaned.split(' ').slice(0, 3).join(' ')) || 'bilinmeyen',
    merchantName: fallbackName,
    category: keywordHit?.category ?? 'OTHER',
    channel: channelFromDescriptor,
    confidence: keywordHit ? 0.55 : 0.35,
    strategy: 'UNRESOLVED',
    cleanedDescriptor: cleaned,
    // An unknown merchant is NOT assumed to be noise — a small local SaaS is a
    // perfectly valid subscription. Only an explicit retail keyword rules it out.
    isNoise: keywordHit?.retailNoise ?? false,
    isAggregator: false,
    variableAmount: false,
  };
}

function build(
  definition: MerchantDefinition,
  cleaned: string,
  channelFromDescriptor: BillingChannel,
  confidence: number,
  strategy: MerchantMatchStrategy,
): NormalizedMerchant {
  return {
    merchantKey: definition.key,
    merchantName: definition.displayName,
    category: definition.category,
    // The descriptor's own channel evidence wins; the dictionary hint is the
    // fallback for cases where the rail left no fingerprint.
    channel:
      channelFromDescriptor !== 'UNKNOWN'
        ? channelFromDescriptor
        : definition.channelHint ?? 'UNKNOWN',
    confidence,
    strategy,
    cleanedDescriptor: cleaned,
    isNoise: definition.retailNoise ?? false,
    isAggregator: definition.isAggregator ?? false,
    variableAmount: definition.variableAmount ?? false,
  };
}

/** Whole-token containment, so "GAIN" never matches inside "BARGAIN". */
function containsPhrase(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const index = haystack.indexOf(needle);
  if (index === -1) return false;
  const before = index === 0 ? ' ' : haystack[index - 1]!;
  const afterIndex = index + needle.length;
  const after = afterIndex >= haystack.length ? ' ' : haystack[afterIndex]!;
  return before === ' ' && after === ' ';
}

export function slugify(input: string): string {
  return foldTurkish(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "MEHMET USTA KEBAP" -> "Mehmet Usta Kebap" */
export function titleCaseTR(input: string): string {
  return input
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1))
    .join(' ');
}
