'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { SubscriptionVM } from '@/server/dashboard-service';
import { Badge, GoldButton } from '@/components/ui/primitives';
import { RiskFactorList } from './risk-meter';
import { UI_TR } from '@/core/i18n/tr';
import { cn } from '@/lib/utils';

/**
 * Cancellation drawer.
 *
 * Everything the user needs to actually stop the charge, in the order they need
 * it: what the money is, which rail pulls it, the caveats that will bite them,
 * the numbered steps, and — for standing orders — a ready-to-send directive.
 *
 * The step checklist keeps local state on purpose. Cancelling is a multi-minute
 * task performed in another tab or on a phone; losing your place because a
 * re-render dropped the ticks is the difference between a completed
 * cancellation and an abandoned one.
 */
export function CancellationDrawer({
  subscription,
  onClose,
}: {
  subscription: SubscriptionVM | null;
  onClose: () => void;
}) {
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  /**
   * Tracks whether the gesture that is about to produce a click actually
   * *started* on the overlay.
   *
   * Without this the drawer opens and instantly closes: the overlay mounts
   * between the opening button's mousedown and its click, so the click lands on
   * the freshly-mounted overlay and reads as "dismiss". The same bug fires for
   * real users whenever a render lands mid-gesture, and it also swallows the
   * mouseup of a text selection dragged out of the panel.
   */
  const [gestureStartedOnOverlay, setGestureStartedOnOverlay] = useState(false);

  // Reset progress when a different subscription is opened.
  useEffect(() => {
    setCompleted(new Set());
    setCopied(false);
    setGestureStartedOnOverlay(false);
  }, [subscription?.merchantKey]);

  useEffect(() => {
    if (!subscription) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Prevent the page behind the drawer from scrolling under the overlay.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [subscription, onClose]);

  async function copyDirective(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard access can be denied; the textarea below stays selectable.
      setCopied(false);
    }
  }

  function toggleStep(order: number) {
    setCompleted((previous) => {
      const next = new Set(previous);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  }

  const plan = subscription?.cancellation;
  const progress = plan ? completed.size / Math.max(plan.steps.length, 1) : 0;

  return (
    <AnimatePresence>
      {subscription && plan && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onPointerDown={(event) =>
              setGestureStartedOnOverlay(event.target === event.currentTarget)
            }
            onClick={(event) => {
              if (gestureStartedOnOverlay && event.target === event.currentTarget) onClose();
            }}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          />

          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            role="dialog"
            aria-modal="true"
            aria-label={`${subscription.merchantName} iptal rehberi`}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-white/[0.07] bg-obsidian-800/95 backdrop-blur-2xl"
          >
            {/* Header */}
            <header className="shrink-0 border-b border-white/[0.06] px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: subscription.color }}
                    />
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {subscription.merchantName}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    {plan.channelLabel} · {subscription.accountLabel}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label={UI_TR.actions.close}
                  className="shrink-0 rounded-lg border border-white/[0.07] p-2 text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <Metric label="Yıllık tasarruf" value={plan.savingLabel} tone="emerald" />
                <Metric label="Tahmini süre" value={`${plan.estimatedMinutes} dk`} />
                <Metric label="Zorluk" value={plan.difficultyLabel} tone={plan.difficulty >= 4 ? 'rose' : 'neutral'} />
              </div>
            </header>

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <p className="text-xs leading-relaxed text-zinc-400">{plan.summary}</p>

              {plan.cautions.length > 0 && (
                <div className="mt-4 space-y-2">
                  {plan.cautions.map((caution, index) => (
                    <div
                      key={index}
                      className="flex gap-2.5 rounded-xl border border-champagne-400/20 bg-champagne-400/[0.05] px-3.5 py-2.5"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-champagne-400" />
                      <p className="text-[11px] leading-relaxed text-champagne-100/85">{caution}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Steps */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    İptal Adımları
                  </h3>
                  <span className="numeric text-[11px] text-zinc-500">
                    {completed.size}/{plan.steps.length}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <motion.div
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-champagne-500 to-champagne-300"
                  />
                </div>

                <ol className="mt-4 space-y-2.5">
                  {plan.steps.map((step) => {
                    const done = completed.has(step.order);
                    return (
                      <li key={step.order}>
                        <button
                          onClick={() => toggleStep(step.order)}
                          className={cn(
                            'flex w-full gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200',
                            done
                              ? 'border-emerald-500/25 bg-emerald-500/[0.05]'
                              : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.14] hover:bg-white/[0.035]',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold transition-colors',
                              done
                                ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                                : 'border-white/12 text-zinc-500',
                            )}
                          >
                            {done ? <Check className="h-3 w-3" strokeWidth={3} /> : step.order}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block text-xs font-medium',
                                done ? 'text-zinc-500 line-through' : 'text-zinc-100',
                              )}
                            >
                              {step.title}
                            </span>
                            <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
                              {step.detail}
                            </span>
                            {step.warning && (
                              <span className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-rose-300/85">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                {step.warning}
                              </span>
                            )}
                            {step.deepLink && (
                              <a
                                href={step.deepLink}
                                target="_blank"
                                rel="noreferrer noopener"
                                onClick={(event) => event.stopPropagation()}
                                className="mt-2 inline-flex items-center gap-1 text-[11px] text-champagne-300 underline-offset-2 hover:underline"
                              >
                                Bağlantıyı aç
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Bank mandate directive */}
              {plan.directive && (
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                      <FileText className="h-3.5 w-3.5" />
                      Hazır İptal Talimatı
                    </h3>
                    <GoldButton
                      size="sm"
                      variant={copied ? 'outline' : 'solid'}
                      onClick={() => copyDirective(plan.directive!)}
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3" /> {UI_TR.actions.copied}
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> {UI_TR.actions.copyDirective}
                        </>
                      )}
                    </GoldButton>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    Bu metni bankanızın güvenli mesaj kanalına yapıştırabilir veya yazdırıp
                    şubenize iletebilirsiniz. Köşeli parantezli alanları doldurmayı unutmayın.
                  </p>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-black/40 p-4 text-[11px] leading-relaxed text-zinc-300">
                    {plan.directive}
                  </pre>
                </div>
              )}

              {/* Refund policy + guard */}
              <div className="mt-6 space-y-2.5">
                {plan.refundPolicyNote && (
                  <InfoRow icon={<Clock className="h-3.5 w-3.5" />} text={plan.refundPolicyNote} />
                )}
                <InfoRow
                  icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                  text={`İptal sonrası koruma: ${plan.guardUntilLabel} tarihine kadar bu işyerinden gelecek her tahsilat anında size bildirilir.`}
                />
                {plan.phoneNumber && (
                  <InfoRow
                    icon={<Phone className="h-3.5 w-3.5" />}
                    text={`Müşteri hizmetleri: ${plan.phoneNumber}`}
                  />
                )}
              </div>

              {/* Risk breakdown */}
              <div className="mt-6 border-t border-white/[0.06] pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Unutulma Riski Analizi
                  </h3>
                  <Badge tone={subscription.riskScore >= 50 ? 'rose' : 'emerald'}>
                    {subscription.riskScore}/100 · {subscription.riskBandLabel}
                  </Badge>
                </div>
                <div className="mt-4">
                  <RiskFactorList factors={subscription.riskFactors} band={subscription.riskBand} />
                </div>
              </div>

              {/* Detection provenance — every number on the dashboard is auditable. */}
              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-5 text-[11px]">
                <Provenance label="İlk tahsilat" value={subscription.firstChargedLabel} />
                <Provenance label="Son tahsilat" value={subscription.lastChargedLabel} />
                <Provenance label="Toplam tahsilat" value={`${subscription.occurrences} kez`} />
                <Provenance label="Bugüne kadar ödenen" value={subscription.totalPaidLabel} />
                <Provenance label="Tespit güveni" value={`%${subscription.confidencePercent}`} />
                <Provenance label="Döngü" value={subscription.cycleLabel} />
              </dl>
            </div>

            {/* Footer */}
            <footer className="shrink-0 border-t border-white/[0.06] px-6 py-4">
              <div className="flex items-center gap-3">
                {(plan.deepLink || plan.webUrl) && (
                  <a
                    href={plan.deepLink ?? plan.webUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex-1"
                  >
                    <GoldButton className="w-full">
                      İptal sayfasını aç
                      <ExternalLink className="h-3.5 w-3.5" />
                    </GoldButton>
                  </a>
                )}
                <GoldButton variant="outline" onClick={onClose} className={plan.deepLink || plan.webUrl ? '' : 'flex-1'}>
                  {UI_TR.actions.close}
                </GoldButton>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'emerald' | 'rose';
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-600">{label}</p>
      <p
        className={cn(
          'numeric mt-1 text-xs font-semibold',
          tone === 'emerald' && 'text-emerald-400',
          tone === 'rose' && 'text-rose-400',
          tone === 'neutral' && 'text-zinc-200',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-2.5">
      <span className="mt-0.5 shrink-0 text-zinc-500">{icon}</span>
      <p className="text-[11px] leading-relaxed text-zinc-400">{text}</p>
    </div>
  );
}

function Provenance({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-600">{label}</dt>
      <dd className="numeric mt-0.5 text-zinc-300">{value}</dd>
    </div>
  );
}
