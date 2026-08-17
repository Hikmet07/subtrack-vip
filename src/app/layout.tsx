import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SubTrack VIP · Abonelik İstihbarat Platformu',
  description:
    'Türkiye pazarına özel abonelik tespit, zam takibi ve tek tıkla iptal platformu. Banka hesaplarınızı bağlayın, unutulmuş abonelikleri ortaya çıkarın.',
  applicationName: 'SubTrack VIP',
  authors: [{ name: 'SubTrack' }],
  keywords: ['abonelik takibi', 'abonelik iptali', 'zam takibi', 'kişisel finans', 'açık bankacılık'],
};

export const viewport: Viewport = {
  themeColor: '#070709',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `dark` is pinned rather than driven by a media query: this is a
    // dark-by-design product, and a light rendering of the obsidian palette
    // would be unreadable rather than merely different.
    <html lang="tr" className="dark">
      <body className="antialiased">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
