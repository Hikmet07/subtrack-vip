'use client';

import { motion } from 'framer-motion';
import type { RiskBand, RiskFactor } from '@/core/types';
import { cn } from '@/lib/utils';

const BAND_COLOR: Record<RiskBand, string> = {
  LOW: '#10b981',
  MODERATE: '#e6b04c',
  HIGH: '#f59e0b',
  CRITICAL: '#f43f5e',
};

const BAND_TEXT: Record<RiskBand, string> = {
  LOW: 'text-emerald-400',
  MODERATE: 'text-champagne-300',
  HIGH: 'text-amber-400',
  CRITICAL: 'text-rose-400',
};

/**
 * Compact risk dial for the subscription row.
 *
 * An arc rather than a bar: a bar at 66/100 invites "66 out of what budget?",
 * while a dial reads as a gauge — a rating, not a quantity. The numeral sits in
 * the centre because the exact score matters for sorting and for the user's
 * trust in the number being real rather than a vibe.
 */
export function RiskDial({
  score,
  band,
  size = 38,
}: {
  score: number;
  band: RiskBand;
  size?: number;
}) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Three-quarter arc leaves a visual "gap" at the bottom so the dial reads as
  // a gauge rather than a progress ring.
  const arc = circumference * 0.75;
  const filled = (score / 100) * arc;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-[135deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
          strokeDasharray={`${arc} ${circumference}`}
          strokeLinecap="round"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={BAND_COLOR[band]}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${filled} ${circumference}` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span
        className={cn(
          'numeric absolute inset-0 flex items-center justify-center text-[11px] font-semibold',
          BAND_TEXT[band],
        )}
      >
        {score}
      </span>
    </div>
  );
}

/** Factor-by-factor breakdown shown inside the detail drawer. */
export function RiskFactorList({ factors, band }: { factors: RiskFactor[]; band: RiskBand }) {
  if (factors.length === 0) {
    return (
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Bu abonelik için risk oluşturan bir sinyal tespit edilmedi.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {factors.map((factor) => (
        <li key={factor.code}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-medium text-zinc-200">{factor.label}</p>
            <p className="numeric shrink-0 text-[10px] text-zinc-500">
              {factor.points}/{factor.maxPoints} puan
            </p>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(factor.points / factor.maxPoints) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ backgroundColor: BAND_COLOR[band], opacity: 0.8 }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{factor.detail}</p>
        </li>
      ))}
    </ul>
  );
}
