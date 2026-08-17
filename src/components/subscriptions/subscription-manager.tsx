'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpDown,
  CreditCard,
  HelpCircle,
  Layers,
  Repeat,
  Search,
  TrendingUp,
} from 'lucide-react';
import type { SubscriptionVM } from '@/server/dashboard-service';
import { Badge, GlassPanel, GoldButton, SectionHeading, Sparkline } from '@/components/ui/primitives';
import { RiskDial } from './risk-meter';
import { CancellationDrawer } from './cancellation-drawer';
import { UI_TR } from '@/core/i18n/tr';
import { cn } from '@/lib/utils';

type SortKey = 'monthly' | 'risk' | 'renewal' | 'name';
type FilterKey = 'all' | 'zombie' | 'active' | 'bills' | 'lapsed';

const SORT_LABELS: Record<SortKey, string> = {
  monthly: 'Aylık maliyet',
  risk: 'Unutulma riski',
  renewal: 'Yenileme tarihi',
  name: 'İsim',
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'Tümü' },
  { key: 'zombie', label: 'Unutulmuş' },
  { key: 'active', label: 'Aktif' },
  { key: 'bills', label: 'Faturalar' },
  { key: 'lapsed', label: 'Durmuş' },
];

export function SubscriptionManager({ subscriptions }: { subscriptions: SubscriptionVM[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('monthly');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SubscriptionVM | null>(null);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');

    const filtered = subscriptions.filter((subscription) => {
      if (normalizedQuery && !subscription.merchantName.toLocaleLowerCase('tr-TR').includes(normalizedQuery)) {
        return false;
      }
      switch (filter) {
        case 'zombie':
          return subscription.riskBand === 'HIGH' || subscription.riskBand === 'CRITICAL';
        case 'active':
          return subscription.state === 'ACTIVE';
        case 'bills':
          return subscription.state === 'VARIABLE_BILL';
        case 'lapsed':
          return subscription.state === 'LAPSED';
        default:
          return true;
      }
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'risk':
          return b.riskScore - a.riskScore;
        case 'renewal':
          // Streams with no predicted renewal (lapsed) sink to the bottom
          // rather than sorting as "renewing today".
          return (a.daysUntilRenewal ?? 9999) - (b.daysUntilRenewal ?? 9999);
        case 'name':
          return a.merchantName.localeCompare(b.merchantName, 'tr-TR');
        default:
          return b.monthly - a.monthly;
      }
    });
  }, [subscriptions, sortKey, filter, query]);

  const maxMonthly = Math.max(...subscriptions.map((subscription) => subscription.monthly), 1);
  const visibleTotal = visible.reduce((acc, subscription) => acc + subscription.monthly, 0);

  return (
    <>
      <GlassPanel className="p-6">
        <SectionHeading
          icon={<Layers className="h-4 w-4" />}
          title="Abonelik Yöneticisi"
          subtitle={`${visible.length} kayıt · toplam ${formatLira(visibleTotal)}/ay`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ara..."
                  aria-label="Aboneliklerde ara"
                  className="w-36 rounded-lg border border-white/[0.07] bg-white/[0.02] py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-champagne-400/40 focus:outline-none focus:ring-1 focus:ring-champagne-400/20"
                />
              </div>
              <SortMenu value={sortKey} onChange={setSortKey} />
            </div>
          }
        />

        <div className="mt-5 flex flex-wrap gap-1.5">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              onClick={() => setFilter(entry.key)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all duration-200',
                filter === entry.key
                  ? 'border-champagne-400/40 bg-champagne-400/[0.12] text-champagne-200 shadow-glow-gold'
                  : 'border-white/[0.06] bg-white/[0.015] text-zinc-500 hover:border-white/[0.14] hover:text-zinc-300',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1.5">
          {/* Sync mode, not popLayout: popLayout measures exiting children via a
              ref, which a plain function component cannot provide. Each row is
              a `motion.div` with `layout`, so siblings still reflow smoothly. */}
          <AnimatePresence initial={false}>
            {visible.map((subscription) => (
              <SubscriptionRow
                key={subscription.merchantKey}
                subscription={subscription}
                maxMonthly={maxMonthly}
                onOpen={() => setSelected(subscription)}
              />
            ))}
          </AnimatePresence>

          {visible.length === 0 && (
            <p className="py-10 text-center text-xs text-zinc-500">{UI_TR.empty.noSubscriptions}</p>
          )}
        </div>
      </GlassPanel>

      <CancellationDrawer subscription={selected} onClose={() => setSelected(null)} />
    </>
  );
}

// -----------------------------------------------------------------------------
//  Row
// -----------------------------------------------------------------------------

interface SubscriptionRowProps {
  subscription: SubscriptionVM;
  maxMonthly: number;
  onOpen: () => void;
}

function SubscriptionRow({ subscription, maxMonthly, onOpen }: SubscriptionRowProps) {
  const isLapsed = subscription.state === 'LAPSED';
  const isBill = subscription.state === 'VARIABLE_BILL';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.012] transition-all duration-200 hover:border-white/[0.13] hover:bg-white/[0.035]',
        isLapsed && 'opacity-55',
      )}
    >
      {/* Share-of-spend bar, painted behind the row content. Gives an instant
          visual ranking without spending a column on it. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.13]"
        style={{
          width: `${(subscription.monthly / maxMonthly) * 100}%`,
          background: `linear-gradient(90deg, ${subscription.color}, transparent)`,
        }}
      />

      <div className="relative flex items-center gap-4 px-4 py-3">
        <span
          className="h-9 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: subscription.color, opacity: isLapsed ? 0.35 : 0.75 }}
        />

        {/* Identity */}
        <div className="min-w-0 flex-[2]">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-xs font-medium text-zinc-100">{subscription.merchantName}</p>
            {subscription.needsUserLabel && (
              <Badge tone="indigo" className="px-1.5 py-0.5 text-[10px]">
                <HelpCircle className="h-2.5 w-2.5" />
                etiketlenmeli
              </Badge>
            )}
            {subscription.hikeCount > 0 && (
              <Badge tone="rose" className="px-1.5 py-0.5 text-[10px]">
                <TrendingUp className="h-2.5 w-2.5" />
                {subscription.hikeCount} zam
              </Badge>
            )}
            {subscription.multiAccount && (
              <Badge tone="slate" className="px-1.5 py-0.5 text-[10px]">
                <CreditCard className="h-2.5 w-2.5" />
                kart değişti
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] text-zinc-500">
            {subscription.categoryLabel} · {subscription.channelShort} · {subscription.accountLabel}
          </p>
        </div>

        {/* Cycle */}
        <div className="hidden w-24 shrink-0 md:block">
          <p className="flex items-center gap-1 text-[11px] text-zinc-400">
            <Repeat className="h-3 w-3 text-zinc-600" />
            {subscription.cycleLabel}
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">{subscription.occurrences} tahsilat</p>
        </div>

        {/* History */}
        <div className="hidden shrink-0 lg:block">
          <Sparkline
            values={subscription.spark}
            color={subscription.color}
            className="opacity-60 transition-opacity group-hover:opacity-100"
          />
        </div>

        {/* Amount */}
        <div className="w-28 shrink-0 text-right">
          <p className="numeric text-xs font-semibold text-zinc-100">
            {subscription.amountLabel}
            <span className="ml-0.5 text-[10px] font-normal text-zinc-600">
              {subscription.cycleSuffix}
            </span>
          </p>
          <p className="numeric mt-1 text-[10px] text-zinc-500">
            {subscription.monthlyLabel}/ay eşdeğer
          </p>
        </div>

        {/* Renewal */}
        <div className="hidden w-28 shrink-0 text-right xl:block">
          {isLapsed ? (
            <p className="text-[11px] text-zinc-600">Yenileme yok</p>
          ) : (
            <>
              <p
                className={cn(
                  'text-[11px]',
                  (subscription.daysUntilRenewal ?? 99) <= 3
                    ? 'text-champagne-300'
                    : 'text-zinc-400',
                )}
              >
                {subscription.countdownLabel}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600">{subscription.nextRenewalLabel}</p>
            </>
          )}
        </div>

        {/* Risk */}
        <div className="shrink-0">
          {isBill ? (
            <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.06] text-[10px] text-zinc-600">
              n/a
            </span>
          ) : (
            <RiskDial score={subscription.riskScore} band={subscription.riskBand} />
          )}
        </div>

        {/* Action */}
        <div className="shrink-0">
          <GoldButton
            size="sm"
            variant={
              subscription.riskBand === 'CRITICAL' || subscription.riskBand === 'HIGH'
                ? 'solid'
                : 'outline'
            }
            onClick={onOpen}
          >
            {isBill ? UI_TR.actions.details : UI_TR.actions.cancel}
          </GoldButton>
        </div>
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
//  Sort menu
// -----------------------------------------------------------------------------

function SortMenu({ value, onChange }: { value: SortKey; onChange: (key: SortKey) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-zinc-400 transition-colors hover:border-white/[0.16] hover:text-zinc-200"
      >
        <ArrowUpDown className="h-3 w-3" />
        {SORT_LABELS[value]}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.ul
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-xl border border-white/[0.09] bg-obsidian-800/95 p-1 shadow-vip backdrop-blur-xl"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <li key={key}>
                  <button
                    onClick={() => {
                      onChange(key);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-[11px] transition-colors',
                      value === key
                        ? 'bg-champagne-400/[0.12] text-champagne-200'
                        : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100',
                    )}
                  >
                    {SORT_LABELS[key]}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
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
