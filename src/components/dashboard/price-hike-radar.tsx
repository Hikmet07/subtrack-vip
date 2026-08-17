'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Radar, TrendingUp } from 'lucide-react';
import type { HikeVM } from '@/server/dashboard-service';
import { Badge, GlassPanel, SectionHeading } from '@/components/ui/primitives';
import { UI_TR } from '@/core/i18n/tr';

/**
 * Price Hike Radar.
 *
 * Ranked by **lira already lost**, not by headline percentage. A 67% hike on
 * Spotify costs less in a year than a 23% hike on Creative Cloud, and sorting
 * by percentage would put the trivial one on top — the exact inversion of what
 * the user should act on first.
 */
export function PriceHikeRadar({ hikes }: { hikes: HikeVM[] }) {
  const totalExtra = hikes.reduce(
    (acc, hike) => acc + parseTurkishCurrency(hike.extraPaidLabel),
    0,
  );

  return (
    <GlassPanel className="p-6">
      <SectionHeading
        icon={<Radar className="h-4 w-4" />}
        title="Zam Radarı"
        subtitle="Son 12 ayda fiyatı artan hizmetler ve size maliyeti"
        action={
          hikes.length > 0 ? (
            <div className="text-right">
              <p className="numeric text-lg font-semibold text-rose-400">
                {formatLira(totalExtra)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">toplam ek maliyet</p>
            </div>
          ) : undefined
        }
      />

      {hikes.length === 0 ? (
        <p className="mt-6 text-xs text-zinc-500">{UI_TR.empty.noHikes}</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {hikes.slice(0, 6).map((hike, index) => (
            <motion.li
              key={`${hike.merchantKey}-${hike.effectiveLabel}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
              className="group flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3 transition-colors hover:border-rose-500/20 hover:bg-rose-500/[0.03]"
            >
              <span
                className="h-8 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: hike.color, opacity: 0.7 }}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium text-zinc-100">{hike.merchantName}</p>
                  <Badge tone="rose" className="shrink-0 px-1.5 py-0.5 text-[10px]">
                    <TrendingUp className="h-2.5 w-2.5" />
                    {hike.deltaLabel}
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="numeric line-through decoration-zinc-600">{hike.fromLabel}</span>
                  <ArrowRight className="h-3 w-3 text-zinc-600" />
                  <span className="numeric text-zinc-300">{hike.toLabel}</span>
                  <span className="text-zinc-700">·</span>
                  <span>{hike.effectiveLabel}</span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="numeric text-xs font-semibold text-rose-300">{hike.extraPaidLabel}</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">bugüne kadar</p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  yıllık etki {hike.annualImpactLabel}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

const liraFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  maximumFractionDigits: 0,
});

function formatLira(value: number): string {
  return liraFormatter.format(value);
}

/**
 * Parses "₺2.309,23" back to 2309.23.
 *
 * The view model ships display strings so the server owns all formatting; this
 * panel needs one derived total, and re-parsing the four strings it already has
 * is cheaper than threading a parallel numeric field through the whole VM.
 */
function parseTurkishCurrency(label: string): number {
  const numeric = label.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(numeric);
  return Number.isFinite(value) ? value : 0;
}
