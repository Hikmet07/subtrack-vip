/**
 * Multi-tier cancellation guides.
 *
 * The single most important insight in this module: **the cancellation path is
 * determined by the billing rail, not by the brand.** Netflix bought through
 * the App Store cannot be cancelled on netflix.com — the user has to go to
 * Apple. Getting this wrong is the number-one reason people believe they
 * cancelled something and keep getting charged.
 *
 * Guides therefore resolve in three tiers:
 *
 *   1. merchant + channel   most specific, hand-written copy
 *   2. category + channel   e.g. any gym on a standing order
 *   3. channel              always present, never a dead end
 *
 * All user-facing copy is Turkish; identifiers and comments stay English.
 */

import type { BillingChannel, CancellationGuide, SubscriptionCategory } from '../types';

// -----------------------------------------------------------------------------
//  Tier 3 — channel-level fallbacks. Every channel MUST have one.
// -----------------------------------------------------------------------------

const CHANNEL_GUIDES: Record<BillingChannel, CancellationGuide> = {
  APPLE_IAP: {
    id: 'channel-apple',
    channel: 'APPLE_IAP',
    title: 'Apple üzerinden iptal',
    summary:
      'Bu abonelik Apple Kimliğiniz üzerinden tahsil ediliyor. Hizmet sağlayıcının kendi sitesinden iptal etmeniz sonuç vermez; işlemi Apple tarafında yapmanız gerekir.',
    steps: [
      {
        order: 1,
        title: 'Ayarlar uygulamasını açın',
        detail: 'iPhone veya iPad’inizde Ayarlar → en üstteki adınıza dokunun.',
      },
      {
        order: 2,
        title: 'Abonelikler bölümüne girin',
        detail: 'Açılan ekranda “Abonelikler” satırını seçin. Tüm aktif Apple abonelikleriniz listelenir.',
        deepLink: 'https://apps.apple.com/account/subscriptions',
      },
      {
        order: 3,
        title: 'İlgili aboneliği seçin',
        detail:
          'Tutarı ve yenileme tarihini karşılaştırarak doğru aboneliği bulun. Apple ekstrede yalnızca “APPLE.COM/BILL” göründüğü için hangi hizmet olduğunu tutardan teyit edin.',
      },
      {
        order: 4,
        title: 'Aboneliği iptal edin',
        detail: '“Aboneliği İptal Et” düğmesine dokunun ve onaylayın.',
        warning:
          'Onay ekranını kapatmadan “İptal edildi” yazısını gördüğünüzden emin olun. Aksi halde işlem tamamlanmaz.',
      },
    ],
    deepLink: 'https://apps.apple.com/account/subscriptions',
    webUrl: 'https://support.apple.com/tr-tr/HT202039',
    estimatedMinutes: 2,
    difficulty: 1,
    refundPolicyNote:
      'Apple’da iptal, dönem sonuna kadar erişimi kapatmaz. Ödediğiniz süreyi sonuna kadar kullanabilirsiniz.',
    requiresIdentityProof: false,
  },

  GOOGLE_PLAY: {
    id: 'channel-google',
    channel: 'GOOGLE_PLAY',
    title: 'Google Play üzerinden iptal',
    summary:
      'Ödeme Google Play faturalandırması ile alınıyor. İptali Google hesabınız üzerinden yapmalısınız.',
    steps: [
      {
        order: 1,
        title: 'Google Play Store’u açın',
        detail: 'Android cihazınızda Play Store → sağ üstteki profil simgesi.',
      },
      {
        order: 2,
        title: 'Ödemeler ve abonelikler',
        detail: '“Ödemeler ve abonelikler” → “Abonelikler” yolunu izleyin.',
        deepLink: 'https://play.google.com/store/account/subscriptions',
      },
      {
        order: 3,
        title: 'Aboneliği iptal edin',
        detail: 'İlgili hizmeti seçip “Aboneliği iptal et” düğmesine dokunun ve gerekçeyi işaretleyin.',
      },
      {
        order: 4,
        title: 'Onay e-postasını saklayın',
        detail:
          'Google iptal onayını e-posta ile gönderir. Olası bir itiraz için bu e-postayı arşivleyin.',
      },
    ],
    deepLink: 'https://play.google.com/store/account/subscriptions',
    webUrl: 'https://support.google.com/googleplay/answer/7018481?hl=tr',
    estimatedMinutes: 2,
    difficulty: 1,
    refundPolicyNote: 'Mevcut fatura döneminin sonuna kadar hizmeti kullanmaya devam edersiniz.',
    requiresIdentityProof: false,
  },

  DIRECT_CARD: {
    id: 'channel-direct-card',
    channel: 'DIRECT_CARD',
    title: 'Hizmet sağlayıcı üzerinden iptal',
    summary:
      'Tutar doğrudan kartınızdan çekiliyor. İptali hizmetin kendi hesap sayfasından yapmanız gerekiyor.',
    steps: [
      {
        order: 1,
        title: 'Hesabınıza giriş yapın',
        detail: 'Hizmetin web sitesinde, aboneliği başlattığınız e-posta adresiyle oturum açın.',
      },
      {
        order: 2,
        title: 'Abonelik/Üyelik ayarlarını bulun',
        detail:
          'Genellikle “Hesabım”, “Üyelik”, “Plan” veya “Faturalandırma” başlıkları altında yer alır.',
      },
      {
        order: 3,
        title: 'İptal akışını tamamlayın',
        detail:
          'İptal düğmesine basın. Karşınıza indirim teklifleri çıkabilir; hedefiniz iptalse teklifleri reddedip devam edin.',
        warning:
          'Bazı hizmetler “planı dondur” seçeneğini iptal gibi sunar. Dondurma, ödemeyi durdurmaz.',
      },
      {
        order: 4,
        title: 'İptal onayını kaydedin',
        detail: 'Onay e-postasının veya ekran görüntüsünün bir kopyasını saklayın.',
      },
      {
        order: 5,
        title: 'Bir sonraki dönemi izleyin',
        detail:
          'SubTrack, iptal sonrası 60 gün boyunca bu işyerinden gelecek her tahsilatı otomatik olarak size bildirir.',
      },
    ],
    estimatedMinutes: 5,
    difficulty: 3,
    requiresIdentityProof: false,
  },

  BANK_STANDING_ORDER: {
    id: 'channel-standing-order',
    channel: 'BANK_STANDING_ORDER',
    title: 'Otomatik ödeme talimatını iptal',
    summary:
      'Bu ödeme bankanıza verdiğiniz otomatik ödeme talimatı ile yapılıyor. Talimatı iptal etmek ödemeyi durdurur; ancak hizmet sağlayıcı ile sözleşmeniz devam edebilir.',
    steps: [
      {
        order: 1,
        title: 'Önce hizmet sözleşmesini feshedin',
        detail:
          'Yalnızca banka talimatını iptal ederseniz sözleşme borcu işlemeye devam eder ve size borç olarak yansıyabilir. Önce hizmet sağlayıcıya fesih bildirimi gönderin.',
        warning:
          'Bu adımı atlamayın. Talimatın iptali borcu değil, yalnızca ödeme yöntemini ortadan kaldırır.',
      },
      {
        order: 2,
        title: 'İnternet/mobil bankacılığa girin',
        detail:
          '“Ödemeler” → “Otomatik Ödeme Talimatları” (bankaya göre “Düzenli Ödeme Talimatları”) menüsünü açın.',
      },
      {
        order: 3,
        title: 'İlgili talimatı iptal edin',
        detail: 'Listeden ilgili kurumu seçip “Talimatı İptal Et” işlemini onaylayın.',
      },
      {
        order: 4,
        title: 'Gerekirse yazılı talimat gönderin',
        detail:
          'Bankanız dijital iptali desteklemiyorsa, aşağıda sizin için hazırlanan iptal talimatı metnini şubenize veya bankanızın güvenli mesaj kanalına iletin.',
      },
    ],
    estimatedMinutes: 8,
    difficulty: 3,
    refundPolicyNote:
      'Talimat iptali, iptal tarihinden sonraki tahsilatlar için geçerlidir. Halihazırda işleme alınmış bir ödeme geri gelmez.',
    requiresIdentityProof: true,
    mandateTemplate: 'BANK_MANDATE_TR',
  },

  CARRIER_BILLING: {
    id: 'channel-carrier',
    channel: 'CARRIER_BILLING',
    title: 'Mobil ödeme aboneliğini iptal',
    summary:
      'Ücret operatör faturanıza yansıtılıyor. İptali operatörünüz üzerinden yapmanız gerekiyor.',
    steps: [
      {
        order: 1,
        title: 'Operatör uygulamanızı açın',
        detail:
          'Turkcell → “Dijital Servisler”, Vodafone → “Yanımda” uygulaması, Türk Telekom → “Ek Servisler” bölümünü açın.',
      },
      {
        order: 2,
        title: 'Aktif dijital servisleri listeleyin',
        detail: 'Faturanıza yansıyan tüm üçüncü taraf abonelikleri burada görünür.',
      },
      {
        order: 3,
        title: 'Servisi iptal edin',
        detail: 'İlgili servisin yanındaki “İptal Et” seçeneğini kullanın.',
      },
      {
        order: 4,
        title: 'Mobil ödemeyi tümüyle kapatmayı değerlendirin',
        detail:
          'Tekrarını önlemek için operatörünüzden “mobil ödeme kullanımını kapat” talebinde bulunabilirsiniz.',
      },
    ],
    phoneNumber: '532',
    estimatedMinutes: 4,
    difficulty: 2,
    requiresIdentityProof: false,
  },

  WALLET: {
    id: 'channel-wallet',
    channel: 'WALLET',
    title: 'Dijital cüzdan üzerinden iptal',
    summary: 'Ödeme dijital cüzdanınızdan çekiliyor. Yetkilendirmeyi cüzdan uygulamasından kaldırın.',
    steps: [
      {
        order: 1,
        title: 'Cüzdan uygulamasını açın',
        detail: 'Papara veya Paycell uygulamasında “Ayarlar → Otomatik Ödemeler” bölümüne girin.',
      },
      {
        order: 2,
        title: 'Yetkilendirmeyi kaldırın',
        detail: 'İlgili işyerinin tekrarlayan ödeme yetkisini iptal edin.',
      },
      {
        order: 3,
        title: 'Hizmet sağlayıcıya da bildirin',
        detail: 'Sözleşmenin kapandığından emin olmak için hizmetin kendi hesabından da iptal edin.',
      },
    ],
    estimatedMinutes: 4,
    difficulty: 2,
    requiresIdentityProof: false,
  },

  UNKNOWN: {
    id: 'channel-unknown',
    channel: 'UNKNOWN',
    title: 'Ödeme kanalı belirlenemedi',
    summary:
      'Bu tahsilatın hangi kanaldan alındığını ekstre açıklamasından çıkaramadık. En güvenli yol, önce hizmet sağlayıcıya başvurmaktır.',
    steps: [
      {
        order: 1,
        title: 'Ekstre açıklamasını kontrol edin',
        detail:
          'Açıklamada “APPLE.COM/BILL” geçiyorsa Apple, “GOOGLE *” geçiyorsa Google Play, “TALİMAT” geçiyorsa bankanız üzerinden ilerleyin.',
      },
      {
        order: 2,
        title: 'Hizmet sağlayıcıya yazın',
        detail: 'Aboneliğin hangi kanaldan başlatıldığını hizmet sağlayıcının destek ekibine sorun.',
      },
      {
        order: 3,
        title: 'Son çare: kartı bloke ettirin',
        detail:
          'Sonuç alamazsanız bankanızdan ilgili işyeri için “tekrarlayan ödeme bloğu” talep edebilirsiniz.',
        warning:
          'Kartı bloke etmek sözleşmeyi feshetmez; hizmet sağlayıcı borç takibi başlatabilir.',
      },
    ],
    estimatedMinutes: 10,
    difficulty: 4,
    requiresIdentityProof: false,
  },
};

// -----------------------------------------------------------------------------
//  Tier 2 — category × channel
// -----------------------------------------------------------------------------

const CATEGORY_GUIDES: CancellationGuide[] = [
  {
    id: 'category-fitness-standing-order',
    category: 'FITNESS',
    channel: 'BANK_STANDING_ORDER',
    title: 'Spor salonu üyeliğini sonlandırma',
    summary:
      'Spor salonu sözleşmeleri Türkiye’de genellikle taahhütlüdür. Talimatı iptal etmeden önce fesih bildirimini yazılı olarak yapmanız şart.',
    steps: [
      {
        order: 1,
        title: 'Sözleşmenizdeki fesih süresini kontrol edin',
        detail:
          'Çoğu salon 30 gün önceden yazılı bildirim ister. Bu süreyi kaçırırsanız bir dönem daha ücret tahakkuk eder.',
      },
      {
        order: 2,
        title: 'Yazılı fesih bildirimi gönderin',
        detail:
          'Üye olduğunuz şubeye ıslak imzalı dilekçe verin veya kayıtlı e-posta (KEP) ile gönderin. Teslim aldı imzası/kaydı isteyin.',
        warning: 'Telefonla yapılan iptaller ispatlanamaz; mutlaka yazılı kanal kullanın.',
      },
      {
        order: 3,
        title: 'Fesih onayını bekleyin',
        detail: 'Salon tarafından verilen fesih onay belgesini saklayın.',
      },
      {
        order: 4,
        title: 'Banka talimatını iptal edin',
        detail:
          'Fesih onayı elinize geçtikten sonra bankanızdaki otomatik ödeme talimatını kaldırın. Aşağıdaki hazır metni kullanabilirsiniz.',
      },
      {
        order: 5,
        title: 'Cayma hakkınızı unutmayın',
        detail:
          'Sözleşmeye uzaktan (internet üzerinden) girdiyseniz 14 gün içinde gerekçesiz cayma hakkınız bulunur.',
      },
    ],
    estimatedMinutes: 15,
    difficulty: 4,
    refundPolicyNote:
      'Kullanılmayan döneme ait bedelin iadesi, sözleşmenizin fesih maddesine göre değişir.',
    requiresIdentityProof: true,
    mandateTemplate: 'BANK_MANDATE_TR',
  },
  {
    id: 'category-utilities-standing-order',
    category: 'UTILITIES',
    channel: 'BANK_STANDING_ORDER',
    title: 'Fatura otomatik ödeme talimatı',
    summary:
      'Bu bir abonelik değil, zorunlu bir hizmet faturasıdır. Talimatı iptal etmek yalnızca ödeme kolaylığını kaldırır — borç devam eder.',
    steps: [
      {
        order: 1,
        title: 'İptal etmek istediğinizden emin olun',
        detail:
          'Elektrik, su ve doğalgaz talimatlarını iptal ederseniz faturaları elle ödemeniz gerekir; gecikmede kesinti riski doğar.',
        warning: 'SubTrack bu kalemleri tasarruf fırsatı olarak değil, sabit gider olarak sınıflandırır.',
      },
      {
        order: 2,
        title: 'Talimat yerine tarife değiştirin',
        detail:
          'Gerçek tasarruf, talimatı iptal etmekte değil tedarikçi/tarife değiştirmekte. Serbest tüketici hakkınızı sorgulayın.',
      },
    ],
    estimatedMinutes: 3,
    difficulty: 2,
    requiresIdentityProof: false,
  },
];

// -----------------------------------------------------------------------------
//  Tier 1 — merchant × channel
// -----------------------------------------------------------------------------

const MERCHANT_GUIDES: CancellationGuide[] = [
  {
    id: 'netflix-direct',
    merchantKey: 'netflix',
    channel: 'DIRECT_CARD',
    title: 'Netflix üyeliğini iptal et',
    summary: 'Netflix iptali tek adımdır ve dönem sonuna kadar izlemeye devam edebilirsiniz.',
    steps: [
      {
        order: 1,
        title: 'Hesap sayfasını açın',
        detail: 'netflix.com/youraccount adresine gidin ve giriş yapın.',
        deepLink: 'https://www.netflix.com/tr/youraccount',
      },
      {
        order: 2,
        title: '“Üyeliği İptal Et” bağlantısına tıklayın',
        detail: '“Üyelik ve Faturalandırma” bölümünün altında yer alır.',
      },
      {
        order: 3,
        title: 'İptali onaylayın',
        detail: '“İptali Tamamla” düğmesine basın. Fatura döneminizin bitiş tarihi ekranda gösterilir.',
      },
    ],
    webUrl: 'https://www.netflix.com/tr/youraccount',
    estimatedMinutes: 2,
    difficulty: 1,
    refundPolicyNote: 'Fatura döneminin sonuna kadar izlemeye devam edersiniz. Kısmi iade yapılmaz.',
    requiresIdentityProof: false,
  },
  {
    id: 'spotify-direct',
    merchantKey: 'spotify',
    channel: 'DIRECT_CARD',
    title: 'Spotify Premium’u iptal et',
    summary:
      'İptal sonrası hesabınız ücretsiz plana döner; çalma listeleriniz silinmez.',
    steps: [
      {
        order: 1,
        title: 'Abonelik sayfasına gidin',
        detail: 'spotify.com/tr/account/subscription adresini tarayıcıdan açın.',
        deepLink: 'https://www.spotify.com/tr/account/subscription/',
        warning: 'Mobil uygulamadan iptal edilemez; mutlaka tarayıcı kullanın.',
      },
      { order: 2, title: '“Planı Değiştir” → “Premium’u İptal Et”', detail: 'Sayfanın alt kısmındadır.' },
      {
        order: 3,
        title: 'İndirim teklifini geçin',
        detail: 'Spotify sık sık 3 ay indirim teklif eder. Amacınız iptalse “Devam Et” deyin.',
      },
    ],
    webUrl: 'https://www.spotify.com/tr/account/subscription/',
    estimatedMinutes: 3,
    difficulty: 2,
    requiresIdentityProof: false,
  },
  {
    id: 'exxen-direct',
    merchantKey: 'exxen',
    channel: 'DIRECT_CARD',
    title: 'Exxen üyeliğini iptal et',
    summary: 'Exxen iptali hesap ayarlarından yapılır; iptal sonrası dönem sonuna kadar erişim sürer.',
    steps: [
      { order: 1, title: 'exxen.com’a giriş yapın', detail: 'Sağ üstten “Hesabım” bölümüne girin.' },
      {
        order: 2,
        title: '“Paketim” sekmesini açın',
        detail: 'Aktif paketiniz ve yenileme tarihiniz burada görünür.',
      },
      {
        order: 3,
        title: '“Üyeliği Sonlandır” seçeneğini kullanın',
        detail: 'Onay ekranında sonlandırma tarihini not edin.',
        warning:
          'Futbol sezonu başlangıcında otomatik yeniden aktivasyon kampanyalarına dikkat edin.',
      },
    ],
    webUrl: 'https://www.exxen.com',
    estimatedMinutes: 3,
    difficulty: 2,
    requiresIdentityProof: false,
  },
  {
    id: 'adobe-direct',
    merchantKey: 'adobe-cc',
    channel: 'DIRECT_CARD',
    title: 'Adobe Creative Cloud aboneliğini iptal et',
    summary:
      'Adobe’un yıllık taahhütlü planlarında erken iptal bedeli çıkabilir. İptalden önce plan tipinizi kontrol edin.',
    steps: [
      {
        order: 1,
        title: 'Planınızın tipini kontrol edin',
        detail:
          'account.adobe.com/plans → “Yıllık, aylık ödemeli” ise kalan ayların %50’si kadar erken çıkış bedeli uygulanır.',
        deepLink: 'https://account.adobe.com/plans',
        warning: 'Yenileme tarihinden sonraki 14 gün içinde iptal ederseniz ceza uygulanmaz.',
      },
      { order: 2, title: '“Planı yönet” → “Planı iptal et”', detail: 'Adım adım akışı izleyin.' },
      {
        order: 3,
        title: 'Alternatifi değerlendirin',
        detail:
          'Yalnızca tek bir uygulama kullanıyorsanız, iptal yerine tekli uygulama planına geçmek genellikle daha ekonomiktir.',
      },
    ],
    webUrl: 'https://account.adobe.com/plans',
    estimatedMinutes: 8,
    difficulty: 4,
    refundPolicyNote: 'Yıllık taahhütte erken iptal bedeli doğabilir.',
    requiresIdentityProof: false,
  },
  {
    id: 'chatgpt-direct',
    merchantKey: 'chatgpt-plus',
    channel: 'DIRECT_CARD',
    title: 'ChatGPT Plus aboneliğini iptal et',
    summary: 'İptal anında geçerli olur; dönem sonuna kadar Plus özellikleri açık kalır.',
    steps: [
      { order: 1, title: 'ChatGPT’ye giriş yapın', detail: 'Sol alt köşedeki hesap menüsünü açın.' },
      {
        order: 2,
        title: '“My plan” → “Manage my subscription”',
        detail: 'Stripe faturalandırma portalına yönlendirilirsiniz.',
      },
      { order: 3, title: '“Cancel plan” düğmesine basın', detail: 'Onay sonrası bitiş tarihi gösterilir.' },
    ],
    estimatedMinutes: 3,
    difficulty: 2,
    refundPolicyNote:
      'Tutar ABD doları üzerinden alınır; kur farkı nedeniyle her ay TL karşılığı değişir.',
    requiresIdentityProof: false,
  },
  {
    id: 'macfit-standing-order',
    merchantKey: 'macfit',
    channel: 'BANK_STANDING_ORDER',
    title: 'MACFit üyeliğini sonlandır',
    summary:
      'MACFit üyelikleri taahhütlüdür ve fesih yazılı bildirim gerektirir. Yalnızca banka talimatını iptal etmek borcu durdurmaz.',
    steps: [
      {
        order: 1,
        title: 'Üye olduğunuz kulübe dilekçe verin',
        detail:
          'Kimliğinizle birlikte şubeye giderek fesih dilekçesi doldurun ve imzalı bir kopyasını alın.',
        warning: 'Sözleşmede genellikle 30 gün ihbar süresi bulunur.',
      },
      {
        order: 2,
        title: 'Fesih onayını bekleyin',
        detail: 'Onay SMS/e-postasının ulaşmasını bekleyin.',
      },
      {
        order: 3,
        title: 'Banka talimatını iptal edin',
        detail: 'Aşağıdaki hazır talimat metnini bankanıza iletin.',
      },
    ],
    phoneNumber: '0850 222 6234',
    estimatedMinutes: 20,
    difficulty: 5,
    refundPolicyNote: 'Taahhüt süresi dolmadan çıkışta cayma bedeli talep edilebilir.',
    requiresIdentityProof: true,
    mandateTemplate: 'BANK_MANDATE_TR',
  },
  {
    id: 'trendyol-premium-direct',
    merchantKey: 'trendyol-premium',
    channel: 'DIRECT_CARD',
    title: 'Trendyol Premium üyeliğini iptal et',
    summary: 'Uygulama içinden tek adımda iptal edilebilir.',
    steps: [
      {
        order: 1,
        title: 'Trendyol uygulamasında “Hesabım”',
        detail: '“Trendyol Premium” satırına dokunun.',
        deepLink: 'https://www.trendyol.com/hesabim/premium',
      },
      { order: 2, title: '“Üyeliği İptal Et”', detail: 'Onay ekranını tamamlayın.' },
    ],
    estimatedMinutes: 2,
    difficulty: 1,
    requiresIdentityProof: false,
  },
];

// -----------------------------------------------------------------------------
//  Resolution
// -----------------------------------------------------------------------------

export const ALL_CANCELLATION_GUIDES: CancellationGuide[] = [
  ...MERCHANT_GUIDES,
  ...CATEGORY_GUIDES,
  ...Object.values(CHANNEL_GUIDES),
];

/**
 * Resolves the most specific guide available.
 *
 * Aggregator sub-streams arrive keyed as "apple::d08"; the base key is used for
 * lookup so an unnamed Apple stream still lands on the Apple guide.
 */
export function resolveCancellationGuide(
  merchantKey: string,
  category: SubscriptionCategory,
  channel: BillingChannel,
): CancellationGuide {
  const baseKey = merchantKey.split('::')[0]!;

  const merchantMatch = MERCHANT_GUIDES.find(
    (guide) => guide.merchantKey === baseKey && guide.channel === channel,
  );
  if (merchantMatch) return merchantMatch;

  // A merchant guide for a different rail is still better than nothing for
  // context, but only when no category rule covers the actual rail.
  const categoryMatch = CATEGORY_GUIDES.find(
    (guide) => guide.category === category && guide.channel === channel,
  );
  if (categoryMatch) return categoryMatch;

  return CHANNEL_GUIDES[channel];
}

export function getChannelGuide(channel: BillingChannel): CancellationGuide {
  return CHANNEL_GUIDES[channel];
}
