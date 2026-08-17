'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, BellRing, CalendarClock, Info, ShieldAlert } from 'lucide-react';
import type { AlertVM, RenewalVM } from '@/server/dashboard-service';
import { Badge, GlassPanel, SectionHeading } from '@/components/ui/primitives';
import { UI_TR } from '@/core/i18n/tr';
import { cn } from '@/lib/utils';

/**
 * Upcoming renewals as a vertical timeline.
 *
 * The connecting rail is not decoration: it turns a list of dates into an
 * ordered runway, so "what hits me next" is answerable at a glance without
 * reading a single date.
 */
export function RenewalTimeline({ renewals }: { renewals: RenewalVM[] }) {
  return (
    <GlassPanel className="p-6">
      <SectionHeading
        icon={<CalendarClock className="h-4 w-4" />}
        title="Yaklaşan Yenilemeler"
        subtitle="Tahmini tarihler, geçmiş tahsilat düzeninize göre hesaplanır"
      />

      {renewals.length === 0 ? (
        <p className="mt-6 text-xs text-zinc-500">Yaklaşan yenileme bulunmuyor.</p>
      ) : (
        <ol className="relative mt-5 space-y-1">
          <span
            className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-champagne-400/40 via-white/10 to-transparent"
            aria-hidden
          />
          {renewals.map((renewal, index) => (
            <motion.li
              key={renewal.merchantKey}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.045, duration: 0.4 }}
              className="relative flex items-center gap-4 rounded-lg py-2 pl-7 pr-2 transition-colors hover:bg-white/[0.03]"
            >
              <span
                className={cn(
                  'absolute left-0 h-[15px] w-[15px] rounded-full border-2 border-obsidian-900',
                  renewal.isImminent && 'animate-pulse-glow',
                )}
                style={{ backgroundColor: renewal.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-zinc-200">{renewal.merchantName}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{renewal.dateLabel}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="numeric text-xs font-medium text-zinc-200">{renewal.amountLabel}</p>
                <p
                  className={cn(
                    'mt-0.5 text-[10px]',
                    renewal.isImminent ? 'text-champagne-300' : 'text-zinc-500',
                  )}
                >
                  {renewal.countdownLabel}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      )}
    </GlassPanel>
  );
}

// -----------------------------------------------------------------------------
//  Alerts
// -----------------------------------------------------------------------------

const SEVERITY_ICON = {
  CRITICAL: ShieldAlert,
  WARNING: AlertTriangle,
  INFO: Info,
} as const;

const SEVERITY_STYLE = {
  CRITICAL: 'border-rose-500/25 bg-rose-500/[0.05] text-rose-300',
  WARNING: 'border-champagne-400/25 bg-champagne-400/[0.05] text-champagne-300',
  INFO: 'border-indigo-500/20 bg-indigo-500/[0.04] text-indigo-300',
} as const;

export function AlertStack({ alerts }: { alerts: AlertVM[] }) {
  const criticalCount = alerts.filter((alert) => alert.severity === 'CRITICAL').length;

  return (
    <GlassPanel className="p-6">
      <SectionHeading
        icon={<BellRing className="h-4 w-4" />}
        title="Uyarılar"
        subtitle="Motorun bu tarama sırasında ürettiği bulgular"
        action={
          criticalCount > 0 ? (
            <Badge tone="rose" dot>
              {criticalCount} kritik
            </Badge>
          ) : (
            <Badge tone="emerald" dot>
              Kritik yok
            </Badge>
          )
        }
      />

      {alerts.length === 0 ? (
        <p className="mt-6 text-xs text-zinc-500">{UI_TR.empty.noAlerts}</p>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {alerts.map((alert, index) => {
            const Icon = SEVERITY_ICON[alert.severity];
            return (
              <motion.li
                key={alert.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.4 }}
                className={cn(
                  'flex gap-3 rounded-xl border px-4 py-3',
                  SEVERITY_STYLE[alert.severity],
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug">{alert.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{alert.body}</p>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </GlassPanel>
  );
}
