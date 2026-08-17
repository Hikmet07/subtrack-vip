import { loadDashboard } from '@/server/dashboard-service';
import { KpiRow } from '@/components/dashboard/kpi-row';
import { BurnRateChart } from '@/components/dashboard/burn-rate-chart';
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown';
import { PriceHikeRadar } from '@/components/dashboard/price-hike-radar';
import { AlertStack, RenewalTimeline } from '@/components/dashboard/renewal-timeline';
import {
  AccountStrip,
  DashboardFooter,
  DashboardHeader,
  ProjectionBanner,
} from '@/components/dashboard/shell';
import { SubscriptionManager } from '@/components/subscriptions/subscription-manager';

/**
 * The dashboard is a Server Component.
 *
 * Detection runs over ~1.600 statement lines on every load; doing that on the
 * server keeps the engine, the merchant dictionary and the cancellation guide
 * catalogue entirely out of the client bundle. The browser receives a finished
 * view model of strings and numbers — only the interactive shells
 * (charts, drawer, filters) ship as client components.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const vm = await loadDashboard();

  return (
    <main className="mx-auto w-full max-w-[1480px] px-5 py-8 lg:px-8 lg:py-10">
      <DashboardHeader user={vm.user} asOfLabel={vm.asOfLabel} meta={vm.meta} />

      <div className="mt-7 space-y-5">
        <AccountStrip accounts={vm.accounts} />

        <KpiRow items={vm.kpis} />

        <ProjectionBanner projection={vm.projection} />

        {/* Burn curve gets 3/5 of the width — it is the anchor of the page and
            needs the horizontal room for twelve legible month labels. */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <BurnRateChart
              points={vm.burn.points}
              currentLabel={vm.burn.currentLabel}
              previousLabel={vm.burn.previousLabel}
              deltaLabel={vm.burn.deltaLabel}
              deltaIsGood={vm.burn.deltaIsGood}
              averageLabel={vm.burn.averageLabel}
              shareLabel={vm.burn.shareLabel}
            />
          </div>
          <div className="xl:col-span-2">
            <CategoryBreakdown categories={vm.categories} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <PriceHikeRadar hikes={vm.hikes} />
          </div>
          <RenewalTimeline renewals={vm.renewals} />
        </div>

        <AlertStack alerts={vm.alerts} />

        <SubscriptionManager subscriptions={vm.subscriptions} />
      </div>

      <div className="mt-10">
        <DashboardFooter meta={vm.meta} />
      </div>
    </main>
  );
}
