import { NextResponse } from 'next/server';
import { handleRouteError, runDetection } from '@/server/api-context';

/**
 * Never prerendered.
 *
 * Without this Next statically evaluates the handler at build time and serves
 * that snapshot forever — a data endpoint frozen to whatever the mock ledger
 * looked like when the image was built.
 */
export const dynamic = 'force-dynamic';


/** GET /api/subscriptions — detection output, including sub-threshold candidates. */
export async function GET() {
  try {
    const { detection } = await runDetection();
    return NextResponse.json({
      engineVersion: detection.engineVersion,
      runAt: detection.runAt,
      stats: {
        transactionsScanned: detection.transactionsScanned,
        noiseFiltered: detection.noiseFiltered,
        detected: detection.subscriptions.length,
        candidates: detection.candidates.length,
      },
      subscriptions: detection.subscriptions,
      candidates: detection.candidates,
      alerts: detection.alerts,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
