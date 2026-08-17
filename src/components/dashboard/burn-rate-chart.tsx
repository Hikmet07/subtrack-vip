'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Flame } from 'lucide-react';
import type { BurnPointVM } from '@/server/dashboard-service';
import { GlassPanel, SectionHeading } from '@/components/ui/primitives';

interface Props {
  points: BurnPointVM[];
  currentLabel: string;
  previousLabel: string;
  deltaLabel: string;
  deltaIsGood: boolean;
  averageLabel: string;
  shareLabel: string;
}

/**
 * Trailing-12-month recurring spend, split into fixed subscriptions and
 * variable bills.
 *
 * Two deliberate choices:
 *
 *   * The series are stacked. Subscriptions and utility bills are both
 *     committed spend, so the reader needs the combined height as the primary
 *     quantity and the split as secondary detail.
 *   * The current month is drawn with a dashed boundary and a reference line,
 *     because it is a projection (charges to date + renewals still due). Drawing
 *     it identically to settled months would present a forecast as a fact.
 */
export function BurnRateChart({
  points,
  currentLabel,
  previousLabel,
  deltaLabel,
  deltaIsGood,
  averageLabel,
  shareLabel,
}: Props) {
  const projectedLabel = points.find((point) => point.isProjected)?.label;

  return (
    <GlassPanel className="p-6">
      <SectionHeading
        icon={<Flame className="h-4 w-4" />}
        title="Aylık Harcama Eğrisi"
        subtitle={`Son 12 ay · 6 aylık ortalama ${averageLabel} · ${shareLabel}`}
        action={
          <div className="text-right">
            <p className="numeric text-xl font-semibold text-champagne-300">{currentLabel}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              geçen ay {previousLabel}{' '}
              <span className={deltaIsGood ? 'text-emerald-400' : 'text-rose-400'}>
                {deltaLabel}
              </span>
            </p>
          </div>
        }
      />

      <div className="mt-6 h-[248px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="burnGold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e6b04c" stopOpacity={0.42} />
                <stop offset="55%" stopColor="#e6b04c" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#e6b04c" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="burnSlate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#64748b" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="2 6"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: '#71717a', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              dy={6}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                value >= 1000 ? `${Math.round(value / 1000)}B` : String(value)
              }
            />

            {projectedLabel && (
              <ReferenceLine
                x={projectedLabel}
                stroke="rgba(230,176,76,0.35)"
                strokeDasharray="4 4"
                label={{
                  value: 'öngörülen',
                  position: 'insideTopRight',
                  fill: '#a1a1aa',
                  fontSize: 10,
                }}
              />
            )}

            <Tooltip content={<BurnTooltip />} cursor={{ stroke: 'rgba(230,176,76,0.25)' }} />

            <Area
              type="monotone"
              dataKey="bills"
              stackId="spend"
              stroke="#94a3b8"
              strokeWidth={1.25}
              fill="url(#burnSlate)"
              name="Faturalar"
            />
            <Area
              type="monotone"
              dataKey="subscriptions"
              stackId="spend"
              stroke="#e6b04c"
              strokeWidth={2}
              fill="url(#burnGold)"
              name="Abonelikler"
              activeDot={{
                r: 4,
                fill: '#0b0b0f',
                stroke: '#e6b04c',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center gap-5 text-[11px] text-zinc-500">
        <LegendSwatch color="#e6b04c" label="Abonelikler" />
        <LegendSwatch color="#94a3b8" label="Değişken faturalar" />
      </div>
    </GlassPanel>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

interface TooltipPayloadItem {
  payload: BurnPointVM;
}

function BurnTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;

  return (
    <div className="rounded-xl border border-white/10 bg-obsidian-800/95 px-3.5 py-2.5 shadow-vip backdrop-blur-xl">
      <p className="text-[11px] font-medium text-zinc-300">{point.label}</p>
      <p className="numeric mt-1.5 text-sm font-semibold text-champagne-300">
        {formatLira(point.total)}
      </p>
      <div className="mt-2 space-y-1 text-[11px] text-zinc-500">
        <p>Abonelikler · {formatLira(point.subscriptions)}</p>
        <p>Faturalar · {formatLira(point.bills)}</p>
        {point.isProjected && (
          <p className="pt-1 text-champagne-400/80">Ay sonuna kadar öngörülen tutar</p>
        )}
      </div>
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
