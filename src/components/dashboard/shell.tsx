'use client';

import { motion } from 'framer-motion';
import { Building2, Crown, Shield, Sparkles } from 'lucide-react';
import type { AccountVM, DashboardViewModel } from '@/server/dashboard-service';
import { Badge, GlassPanel } from '@/components/ui/primitives';
import { UI_TR } from '@/core/i18n/tr';
import { cn } from '@/lib/utils';

export function DashboardHeader({
  user,
  asOfLabel,
  meta,
}: {
  user: DashboardViewModel['user'];
  asOfLabel: string;
  meta: DashboardViewModel['meta'];
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-5 border-b border-white/[0.06] pb-6 lg:flex-row lg:items-end lg:justify-between"
    >
      <div>
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gold-sheen shadow-glow-gold">
            <Crown className="h-4.5 w-4.5 text-obsidian-900" strokeWidth={2.25} />
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-none tracking-tight">
              <span className="text-zinc-100">{UI_TR.appName}</span>{' '}
              <span className="gold-text">{UI_TR.appSuffix}</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-600">
              {UI_TR.tagline}
            </p>
          </div>
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-50">
          {user.greetingTR}, {user.name.split(' ')[0]}.
        </h1>
        <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-zinc-500">
          {asOfLabel} itibarıyla {meta.transactionsScanned.toLocaleString('tr-TR')} işlem tarandı,{' '}
          {meta.noiseFiltered.toLocaleString('tr-TR')} perakende hareketi elendi ve{' '}
          {meta.detectedCount} tekrarlayan ödeme akışı tespit edildi.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="emerald" dot>
          <Shield className="h-3 w-3" />
          Salt okunur erişim
        </Badge>
        <Badge tone="indigo">
          <Sparkles className="h-3 w-3" />
          Motor v{meta.engineVersion}
        </Badge>
        <Badge tone="slate">{meta.elapsedMs} ms</Badge>
      </div>
    </motion.header>
  );
}

/**
 * Connected accounts strip.
 *
 * Each chip carries its institution's real brand colour as a left rule. In a
 * multi-banked portfolio that colour is how users locate an account far faster
 * than by reading four masked digits.
 */
export function AccountStrip({ accounts }: { accounts: AccountVM[] }) {
  return (
    <GlassPanel className="p-5" flat>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          <Building2 className="h-3.5 w-3.5" />
          Bağlı Hesaplar
          <span className="text-zinc-700">·</span>
          <span className="normal-case tracking-normal text-zinc-600">
            {accounts.length} hesap
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {accounts.map((account, index) => (
          <motion.div
            key={account.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.04, duration: 0.4 }}
            className="group relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 transition-colors hover:border-white/[0.13] hover:bg-white/[0.035]"
          >
            <span
              className="absolute inset-y-0 left-0 w-[2px]"
              style={{ backgroundColor: account.brandColor }}
            />
            <p className="truncate pl-1.5 text-[11px] font-medium text-zinc-200">
              {account.institutionName}
            </p>
            <p className="mt-0.5 truncate pl-1.5 text-[10px] text-zinc-600">
              {account.displayName} · {account.maskedNumber}
            </p>
            <p
              className={cn(
                'numeric mt-1.5 pl-1.5 text-xs font-medium',
                account.isNegative ? 'text-rose-400/90' : 'text-zinc-300',
              )}
            >
              {account.balanceLabel}
            </p>
          </motion.div>
        ))}
      </div>
    </GlassPanel>
  );
}

/** Annual projection band — the single most sobering number in the product. */
export function ProjectionBanner({
  projection,
}: {
  projection: DashboardViewModel['projection'];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.15 }}
    >
      <GlassPanel className="overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Yıllık Finansal Projeksiyon
            </p>
            <p className="mt-3 text-balance text-lg font-medium leading-snug text-zinc-100">
              {projection.narrative}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Aylık taahhüt {projection.runRateLabel} · yılın %{projection.yearElapsedPercent}&apos;i
              tamamlandı
            </p>
          </div>

          <div className="flex shrink-0 gap-8">
            <ProjectionStat label="Bu yıl ödenen" value={projection.realizedLabel} />
            <ProjectionStat label="Yıl sonuna kalan" value={projection.remainingLabel} accent />
          </div>
        </div>

        {/* Year-progress rail: paid portion in gold, committed remainder ghosted. */}
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${projection.yearElapsedPercent}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-champagne-600 via-champagne-400 to-champagne-300"
          />
        </div>
      </GlassPanel>
    </motion.div>
  );
}

function ProjectionStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p
        className={cn(
          'numeric mt-1.5 text-xl font-semibold',
          accent ? 'text-indigo-300' : 'text-zinc-200',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function DashboardFooter({ meta }: { meta: DashboardViewModel['meta'] }) {
  return (
    <footer className="border-t border-white/[0.06] pt-6 text-[11px] leading-relaxed text-zinc-600">
      <p>
        Veriler <span className="text-zinc-500">{meta.providerName}</span> üzerinden salt okunur
        olarak alınmıştır. SubTrack hiçbir zaman banka şifrenizi saklamaz ve hesabınızda işlem
        yapamaz.
      </p>
      <p className="mt-1.5">
        Tespit motoru v{meta.engineVersion} · {meta.detectedCount} akış ·{' '}
        {meta.candidateCount} doğrulama bekleyen aday · {meta.elapsedMs} ms
      </p>
    </footer>
  );
}
