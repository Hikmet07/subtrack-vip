'use client';

import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { KpiVM } from '@/server/dashboard-service';
import { Sparkline, TiltCard } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const ACCENT_RING: Record<KpiVM['accent'], string> = {
  gold: 'from-champagne-400/25',
  emerald: 'from-emerald-500/25',
  indigo: 'from-indigo-500/25',
  rose: 'from-rose-500/25',
};

const ACCENT_TEXT: Record<KpiVM['accent'], string> = {
  gold: 'text-champagne-300',
  emerald: 'text-emerald-400',
  indigo: 'text-indigo-400',
  rose: 'text-rose-400',
};

const ACCENT_HEX: Record<KpiVM['accent'], string> = {
  gold: '#e6b04c',
  emerald: '#10b981',
  indigo: '#6366f1',
  rose: '#f43f5e',
};

export function KpiRow({ items }: { items: KpiVM[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          // Staggered entrance: the row assembles left to right rather than
          // popping in as a block, which reads as considered rather than abrupt.
          transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <KpiCard item={item} />
        </motion.div>
      ))}
    </div>
  );
}

function KpiCard({ item }: { item: KpiVM }) {
  return (
    <TiltCard className="h-full p-5">
      {/* Corner wash keyed to the tile's semantic accent. */}
      <div
        className={cn(
          'pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-to-br to-transparent blur-2xl',
          ACCENT_RING[item.accent],
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          {item.label}
        </p>
        {item.deltaLabel && <DeltaChip label={item.deltaLabel} isGood={item.deltaIsGood} />}
      </div>

      <p className={cn('numeric mt-4 text-[27px] font-semibold leading-none', ACCENT_TEXT[item.accent])}>
        {item.value}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        {item.caption && (
          <p className="text-[11px] leading-relaxed text-zinc-500">{item.caption}</p>
        )}
        {item.spark && item.spark.length > 1 && (
          <Sparkline
            values={item.spark}
            color={ACCENT_HEX[item.accent]}
            className="shrink-0 opacity-70"
          />
        )}
      </div>
    </TiltCard>
  );
}

/**
 * Colour encodes *good news*, not sign.
 *
 * On a spend dashboard a rising number is bad and a falling one is good — the
 * opposite of a portfolio view. Painting "+12%" green here because green means
 * "up" would tell the user their spending increase is a win.
 */
function DeltaChip({ label, isGood }: { label: string; isGood?: boolean }) {
  const neutral = label.startsWith('%0') || label === '%0,0';
  const Icon = neutral ? Minus : isGood ? ArrowDownRight : ArrowUpRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium leading-none',
        neutral
          ? 'border-white/10 bg-white/[0.04] text-zinc-400'
          : isGood
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
            : 'border-rose-500/25 bg-rose-500/10 text-rose-300',
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      <span className="numeric">{label}</span>
    </span>
  );
}
