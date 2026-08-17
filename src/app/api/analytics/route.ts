import { NextResponse } from 'next/server';
import { buildDashboardAnalytics } from '@/core/analytics/dashboard';
import { handleRouteError, runDetection } from '@/server/api-context';

/**
 * Never prerendered.
 *
 * Without this Next statically evaluates the handler at build time and serves
 * that snapshot forever — a data endpoint frozen to whatever the mock ledger
 * looked like when the image was built.
 */
export const dynamic = 'force-dynamic';


/** GET /api/analytics — burn rate, categories, projection, hike radar. */
export async function GET() {
  try {
    const { detection, transactions, now } = await runDetection();
    const analytics = buildDashboardAnalytics({
      subscriptions: detection.subscriptions,
      transactions,
      now,
    });
    return NextResponse.json(analytics);
  } catch (error) {
    return handleRouteError(error);
  }
}
