'use client';

import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { PieChart as PieIcon } from 'lucide-react';
import type { CategoryVM } from '@/server/dashboard-service';
import { GlassPanel, SectionHeading } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * Category split as a donut plus a ranked list.
 *
 * The donut alone would be near-useless — human eyes cannot compare arc angles
 * to better than about 15%, and the smallest slices here are under 2%. The
 * donut carries the gestalt ("entertainment dominates"), the list carries the
 * numbers, and hovering either one highlights the other.
 */
export function CategoryBreakdown({ categories }: { categories: CategoryVM[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const total = categories.reduce((acc, slice) => acc + slice.monthly, 0);
  const active = categories.find((slice) => slice.key === activeKey);

  return (
    <GlassPanel className="p-6">
      <SectionHeading
        icon={<PieIcon className="h-4 w-4" />}
        title="Kategori Dağılımı"
        subtitle="Aylık eşdeğer maliyete göre"
      />

      <div className="mt-5 flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        <div className="relative h-[188px] w-[188px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categories}
                dataKey="monthly"
                nameKey="label"
                innerRadius={62}
                outerRadius={90}
                paddingAngle={2}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                onMouseEnter={(_, index) => setActiveKey(categories[index]?.key ?? null)}
                onMouseLeave={() => setActiveKey(null)}
              >
                {categories.map((slice) => (
                  <Cell
                    key={slice.key}
                    fill={slice.color}
                    opacity={activeKey && activeKey !== slice.key ? 0.28 : 0.92}
                    style={{ transition: 'opacity 180ms ease', cursor: 'pointer' }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Centre readout: total by default, the hovered slice on interaction. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="max-w-[104px] text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
              {active ? active.label : 'Aylık Toplam'}
            </p>
            <p className="numeric mt-1 text-lg font-semibold text-zinc-100">
              {active ? active.monthlyLabel : formatLira(total)}
            </p>
            {active && <p className="mt-0.5 text-[11px] text-zinc-500">{active.shareLabel}</p>}
          </div>
        </div>

        <ul className="w-full flex-1 space-y-1">
          {categories.map((slice, index) => (
            <motion.li
              key={slice.key}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.035, duration: 0.35 }}
              onMouseEnter={() => setActiveKey(slice.key)}
              onMouseLeave={() => setActiveKey(null)}
              className={cn(
                'group flex cursor-default items-center gap-3 rounded-lg px-2.5 py-2 transition-colors',
                activeKey === slice.key ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-inset ring-black/20"
                style={{ backgroundColor: slice.color }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-zinc-200">
                  {slice.label}
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(slice.share * 100, 1.5)}%` }}
                    transition={{ delay: 0.15 + index * 0.035, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="block h-full rounded-full"
                    style={{ backgroundColor: slice.color, opacity: 0.75 }}
                  />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="numeric block text-xs font-medium text-zinc-200">
                  {slice.monthlyLabel}
                </span>
                <span className="mt-0.5 block text-[10px] text-zinc-500">
                  {slice.count} abonelik · {slice.shareLabel}
                </span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
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
