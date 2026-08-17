/**
 * Turkish localisation for domain vocabulary.
 *
 * Every user-facing string in SubTrack VIP is Turkish, but it lives here rather
 * than being scattered through components so that (a) the tone stays uniformly
 * formal-but-warm — private-banking register, not startup-casual — and (b) a
 * second locale is a new file, not a rewrite.
 *
 * Register notes for anyone editing this file:
 *   * Use "abonelik", never "subscription".
 *   * Address the user with the plural/formal "-iniz" throughout.
 *   * Prefer "tahsilat" over "çekim" for a charge; it reads like a bank.
 */

import type {
  AlertKind,
  BillingChannel,
  BillingCycle,
  RiskBand,
  SubscriptionCategory,
  SubscriptionState,
} from '../types';

export const CATEGORY_LABELS_TR: Record<SubscriptionCategory, string> = {
  ENTERTAINMENT: 'Eğlence',
  MUSIC: 'Müzik',
  AI_CLOUD: 'Yapay Zekâ & Bulut',
  SAAS: 'Yazılım',
  FITNESS: 'Spor & Sağlık',
  UTILITIES: 'Faturalar',
  TELECOM: 'Telekom',
  NEWS_MEDIA: 'Haber & Yayın',
  GAMING: 'Oyun',
  EDUCATION: 'Eğitim',
  FOOD_DELIVERY: 'Yemek & Market',
  TRANSPORT: 'Ulaşım',
  INSURANCE: 'Sigorta',
  OTHER: 'Diğer',
};

/** Chart and badge accents, one per category. Kept inside the VIP palette. */
export const CATEGORY_COLORS: Record<SubscriptionCategory, string> = {
  ENTERTAINMENT: '#e6b04c',
  MUSIC: '#f59e0b',
  AI_CLOUD: '#6366f1',
  SAAS: '#8b5cf6',
  FITNESS: '#10b981',
  UTILITIES: '#64748b',
  TELECOM: '#0ea5e9',
  NEWS_MEDIA: '#f472b6',
  GAMING: '#a78bfa',
  EDUCATION: '#34d399',
  FOOD_DELIVERY: '#fb923c',
  TRANSPORT: '#22d3ee',
  INSURANCE: '#94a3b8',
  OTHER: '#71717a',
};

export const CHANNEL_LABELS_TR: Record<BillingChannel, string> = {
  APPLE_IAP: 'Apple Uygulama İçi Satın Alma',
  GOOGLE_PLAY: 'Google Play Faturalandırma',
  DIRECT_CARD: 'Doğrudan Kart Ödemesi',
  BANK_STANDING_ORDER: 'Otomatik Ödeme Talimatı',
  CARRIER_BILLING: 'Mobil Ödeme (Operatör Faturası)',
  WALLET: 'Dijital Cüzdan',
  UNKNOWN: 'Belirlenemedi',
};

/** Short form for dense card chips. */
export const CHANNEL_SHORT_TR: Record<BillingChannel, string> = {
  APPLE_IAP: 'Apple',
  GOOGLE_PLAY: 'Google Play',
  DIRECT_CARD: 'Kart',
  BANK_STANDING_ORDER: 'Talimat',
  CARRIER_BILLING: 'Mobil Ödeme',
  WALLET: 'Cüzdan',
  UNKNOWN: 'Bilinmiyor',
};

export const CYCLE_LABELS_TR: Record<BillingCycle, string> = {
  WEEKLY: 'Haftalık',
  MONTHLY: 'Aylık',
  QUARTERLY: '3 Aylık',
  SEMIANNUAL: '6 Aylık',
  YEARLY: 'Yıllık',
  IRREGULAR: 'Düzensiz',
};

/** "/ay", "/yıl" — appended to a price. */
export const CYCLE_SUFFIX_TR: Record<BillingCycle, string> = {
  WEEKLY: '/hafta',
  MONTHLY: '/ay',
  QUARTERLY: '/3 ay',
  SEMIANNUAL: '/6 ay',
  YEARLY: '/yıl',
  IRREGULAR: '',
};

export const STATE_LABELS_TR: Record<SubscriptionState, string> = {
  ACTIVE: 'Aktif',
  VARIABLE_BILL: 'Değişken Fatura',
  PAUSED: 'Duraklatıldı',
  CANCELLATION_STARTED: 'İptal Sürecinde',
  CANCELLED: 'İptal Edildi',
  LAPSED: 'Kendiliğinden Durdu',
  CANDIDATE: 'Doğrulama Bekliyor',
};

export const RISK_BAND_LABELS_TR: Record<RiskBand, string> = {
  LOW: 'Düşük',
  MODERATE: 'Orta',
  HIGH: 'Yüksek',
  CRITICAL: 'Kritik',
};

export const ALERT_KIND_LABELS_TR: Record<AlertKind, string> = {
  RENEWAL_UPCOMING: 'Yaklaşan Yenileme',
  PRICE_HIKE: 'Zam Tespit Edildi',
  ZOMBIE_SUBSCRIPTION: 'Unutulmuş Abonelik',
  ROGUE_CHARGE: 'İptal Sonrası Tahsilat',
  DUPLICATE_SERVICE: 'Mükerrer Hizmet',
  TRIAL_ENDING: 'Deneme Süresi Bitiyor',
};

/** Copy used across the dashboard shell. */
export const UI_TR = {
  appName: 'SubTrack',
  appSuffix: 'VIP',
  tagline: 'Abonelik İstihbarat Platformu',

  nav: {
    overview: 'Genel Bakış',
    subscriptions: 'Abonelikler',
    analytics: 'Analitik',
    cancellations: 'İptal Merkezi',
    accounts: 'Hesaplar',
  },

  kpi: {
    monthlyBurn: 'Aylık Abonelik Yükü',
    monthlyDelta: 'Geçen Aya Göre',
    annualProjection: 'Yıllık Projeksiyon',
    detectedCount: 'Tespit Edilen Abonelik',
    potentialSaving: 'Potansiyel Yıllık Tasarruf',
    zombieCount: 'Unutulmuş Abonelik',
  },

  sections: {
    burnRate: 'Aylık Harcama Eğrisi',
    categoryBreakdown: 'Kategori Dağılımı',
    priceHikeRadar: 'Zam Radarı',
    upcomingRenewals: 'Yaklaşan Yenilemeler',
    zombieList: 'Unutulmuş Abonelikler',
    allSubscriptions: 'Tüm Abonelikler',
    alerts: 'Uyarılar',
  },

  actions: {
    cancel: 'İptal Et',
    viewGuide: 'İptal Rehberini Aç',
    copyDirective: 'Talimat Metnini Kopyala',
    copied: 'Kopyalandı',
    markUsed: 'Kullanıyorum',
    ignore: 'Yoksay',
    details: 'Detaylar',
    close: 'Kapat',
    connectBank: 'Banka Bağla',
  },

  empty: {
    noSubscriptions: 'Henüz abonelik tespit edilmedi.',
    noAlerts: 'Bekleyen uyarınız yok.',
    noHikes: 'Son 12 ayda zam tespit edilmedi.',
  },
} as const;
