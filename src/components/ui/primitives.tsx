'use client';

import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'framer-motion';
import type { MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// -----------------------------------------------------------------------------
//  Panel
// -----------------------------------------------------------------------------

export function GlassPanel({
  children,
  className,
  flat = false,
}: {
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div className={cn('vip-panel', flat && 'vip-panel-flat', className)}>{children}</div>
  );
}

// -----------------------------------------------------------------------------
//  Tilt card
// -----------------------------------------------------------------------------

const TILT_DEGREES = 5;

/**
 * Pointer-tracked 3D tilt with a specular highlight that follows the cursor.
 *
 * Two details separate this from the usual CSS-only tilt:
 *   * rotation runs through a spring, so the card settles rather than snapping;
 *   * the highlight is a radial gradient positioned at the pointer, which is
 *     what makes the surface read as glass rather than as a rotating rectangle.
 *
 * Both are suppressed for `prefers-reduced-motion` via the global CSS override.
 */
export function TiltCard({
  children,
  className,
  intensity = 1,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);

  const springConfig = { stiffness: 220, damping: 22, mass: 0.4 };
  const rotateX = useSpring(
    useTransform(pointerY, [0, 1], [TILT_DEGREES * intensity, -TILT_DEGREES * intensity]),
    springConfig,
  );
  const rotateY = useSpring(
    useTransform(pointerX, [0, 1], [-TILT_DEGREES * intensity, TILT_DEGREES * intensity]),
    springConfig,
  );

  const glowX = useTransform(pointerX, (value) => `${value * 100}%`);
  const glowY = useTransform(pointerY, (value) => `${value * 100}%`);
  const glow = useMotionTemplate`radial-gradient(420px circle at ${glowX} ${glowY}, rgba(230,176,76,0.10), transparent 65%)`;

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width);
    pointerY.set((event.clientY - bounds.top) / bounds.height);
  }

  function handleLeave() {
    pointerX.set(0.5);
    pointerY.set(0.5);
  }

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={cn('vip-panel group/tilt will-change-transform', className)}
    >
      <motion.div
        style={{ background: glow }}
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
//  Buttons
// -----------------------------------------------------------------------------

export function GoldButton({
  children,
  onClick,
  className,
  variant = 'solid',
  size = 'md',
  type = 'button',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'solid' | 'ghost' | 'outline';
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const base =
    'relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-900';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
  };

  const variants = {
    // The inset white hairline is what gives the fill a "milled metal" edge.
    solid:
      'bg-gradient-to-br from-champagne-300 via-champagne-400 to-champagne-600 text-obsidian-900 shadow-[0_8px_24px_-8px_rgba(230,176,76,0.55),inset_0_1px_0_0_rgba(255,255,255,0.45)] hover:shadow-[0_12px_32px_-8px_rgba(230,176,76,0.75),inset_0_1px_0_0_rgba(255,255,255,0.55)] hover:brightness-110 active:scale-[0.98]',
    outline:
      'border border-champagne-400/25 bg-champagne-400/[0.06] text-champagne-200 hover:border-champagne-400/50 hover:bg-champagne-400/[0.12] hover:shadow-glow-gold active:scale-[0.98]',
    ghost:
      'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 active:scale-[0.98]',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, sizes[size], variants[variant], className)}
    >
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
//  Badges
// -----------------------------------------------------------------------------

export type BadgeTone = 'neutral' | 'gold' | 'emerald' | 'indigo' | 'rose' | 'slate';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-white/10 bg-white/[0.04] text-zinc-300',
  gold: 'border-champagne-400/25 bg-champagne-400/[0.10] text-champagne-200',
  emerald: 'border-emerald-500/25 bg-emerald-500/[0.10] text-emerald-300',
  indigo: 'border-indigo-500/25 bg-indigo-500/[0.10] text-indigo-300',
  rose: 'border-rose-500/25 bg-rose-500/[0.10] text-rose-300',
  slate: 'border-white/[0.06] bg-white/[0.02] text-zinc-500',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
  dot,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none tracking-wide',
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

// -----------------------------------------------------------------------------
//  Skeletons
// -----------------------------------------------------------------------------

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg', className)} />;
}

/**
 * Loading placeholder for a panel.
 * Shaped like the content it replaces — a generic grey box makes the layout
 * jump on load, which on a financial dashboard feels like a glitch.
 */
export function PanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <GlassPanel className={cn('p-6', className)}>
      <Shimmer className="h-3 w-32" />
      <Shimmer className="mt-4 h-8 w-48" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Shimmer className="h-9 w-9 rounded-xl" />
            <Shimmer className="h-3 flex-1" />
            <Shimmer className="h-3 w-16" />
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

// -----------------------------------------------------------------------------
//  Sparkline
// -----------------------------------------------------------------------------

/**
 * Dependency-free inline sparkline.
 *
 * Recharts is excellent for the big charts but far too heavy to instantiate
 * once per table row — twenty rows would mean twenty ResponsiveContainers and a
 * visible scroll stutter. Sixty lines of path maths costs nothing.
 */
export function Sparkline({
  values,
  color = '#e6b04c',
  className,
  height = 28,
  width = 84,
}: {
  values: number[];
  color?: string;
  className?: string;
  height?: number;
  width?: number;
}) {
  if (values.length < 2) return <div style={{ width, height }} className={className} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const padding = 3;
  const usable = height - padding * 2;

  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = padding + usable - ((value - min) / span) * usable;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M ${points.join(' L ')}`;
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const gradientId = `spark-${color.replace('#', '')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

// -----------------------------------------------------------------------------
//  Section heading
// -----------------------------------------------------------------------------

export function SectionHeading({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-champagne-400/20 bg-champagne-400/[0.07] text-champagne-300">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-zinc-100">{title}</h2>
          {subtitle && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
