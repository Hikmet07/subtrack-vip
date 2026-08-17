import type { Config } from 'tailwindcss';

/**
 * SubTrack VIP design tokens.
 *
 * The palette is intentionally narrow: obsidian/charcoal grounds, a single
 * champagne-gold accent ramp, and exactly three semantic hues (emerald =
 * savings, indigo = AI insight, rose = risk). Anything outside this set is a
 * design smell — private-banking interfaces earn their premium feel from
 * restraint, not from colour variety.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#070709',
          950: '#050507',
          900: '#070709',
          800: '#0b0b0f',
          700: '#111116',
          600: '#16161d',
          500: '#1d1d26',
        },
        champagne: {
          50: '#fdf8ec',
          100: '#f8ecd0',
          200: '#f1d9a3',
          300: '#e9c473',
          400: '#e6b04c', // primary accent
          500: '#f59e0b', // warm amber
          600: '#d18a1f',
          700: '#a06714',
          800: '#6d4610',
          900: '#40290a',
        },
        savings: {
          DEFAULT: '#10b981',
          soft: 'rgba(16, 185, 129, 0.12)',
        },
        insight: {
          DEFAULT: '#6366f1',
          soft: 'rgba(99, 102, 241, 0.12)',
        },
        alarm: {
          DEFAULT: '#f43f5e',
          soft: 'rgba(244, 63, 94, 0.12)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Tabular numerals matter enormously in financial UIs: figures must
        // align vertically across rows so the eye can scan a column of TRY.
        numeric: ['var(--font-numeric)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        vip: '0 24px 60px -24px rgba(0, 0, 0, 0.9), 0 1px 0 0 rgba(255, 255, 255, 0.04) inset',
        'vip-lifted':
          '0 40px 90px -30px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(230, 176, 76, 0.18), 0 1px 0 0 rgba(255, 255, 255, 0.06) inset',
        'glow-gold': '0 0 32px -6px rgba(230, 176, 76, 0.45)',
        'glow-emerald': '0 0 32px -6px rgba(16, 185, 129, 0.4)',
      },
      backgroundImage: {
        'gold-sheen':
          'linear-gradient(135deg, #f1d9a3 0%, #e6b04c 38%, #d18a1f 62%, #f8ecd0 100%)',
        'obsidian-veil':
          'radial-gradient(120% 100% at 50% 0%, rgba(230,176,76,0.10) 0%, rgba(7,7,9,0) 55%)',
        'panel-frost':
          'linear-gradient(160deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 45%, rgba(255,255,255,0.028) 100%)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.85' },
        },
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s infinite',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
        'rise-in': 'rise-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
