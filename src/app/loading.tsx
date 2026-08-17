import { GlassPanel, Shimmer } from '@/components/ui/primitives';

/**
 * Loading state.
 *
 * Shaped like the real dashboard rather than a spinner. Detection takes a
 * couple of hundred milliseconds over two years of statements, and a skeleton
 * that already occupies the final layout means nothing shifts when the data
 * lands — no reflow, no flash, no impression that the page "broke and then
 * recovered".
 */
export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-[1480px] px-5 py-8 lg:px-8 lg:py-10">
      <div className="flex items-end justify-between border-b border-white/[0.06] pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <Shimmer className="h-9 w-9 rounded-xl" />
            <div className="space-y-2">
              <Shimmer className="h-3 w-32" />
              <Shimmer className="h-2 w-44" />
            </div>
          </div>
          <Shimmer className="mt-6 h-7 w-64" />
          <Shimmer className="mt-3 h-3 w-96" />
        </div>
        <div className="hidden gap-2 lg:flex">
          <Shimmer className="h-6 w-32 rounded-full" />
          <Shimmer className="h-6 w-24 rounded-full" />
        </div>
      </div>

      <div className="mt-7 space-y-5">
        <GlassPanel className="p-5" flat>
          <Shimmer className="h-3 w-40" />
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Shimmer key={index} className="h-[68px] rounded-xl" />
            ))}
          </div>
        </GlassPanel>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <GlassPanel key={index} className="p-5">
              <Shimmer className="h-2.5 w-28" />
              <Shimmer className="mt-5 h-7 w-36" />
              <Shimmer className="mt-5 h-2.5 w-40" />
            </GlassPanel>
          ))}
        </div>

        <GlassPanel className="p-6">
          <Shimmer className="h-3 w-52" />
          <Shimmer className="mt-4 h-6 w-80" />
          <Shimmer className="mt-5 h-1.5 w-full rounded-full" />
        </GlassPanel>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <GlassPanel className="p-6 xl:col-span-3">
            <Shimmer className="h-3 w-44" />
            <Shimmer className="mt-6 h-[248px] rounded-xl" />
          </GlassPanel>
          <GlassPanel className="p-6 xl:col-span-2">
            <Shimmer className="h-3 w-36" />
            <div className="mt-6 flex items-start gap-6">
              <Shimmer className="h-[188px] w-[188px] shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Shimmer key={index} className="h-4" />
                ))}
              </div>
            </div>
          </GlassPanel>
        </div>

        <GlassPanel className="p-6">
          <Shimmer className="h-3 w-40" />
          <div className="mt-5 space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Shimmer key={index} className="h-[62px] rounded-xl" />
            ))}
          </div>
        </GlassPanel>
      </div>
    </main>
  );
}
