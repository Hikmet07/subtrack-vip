import { NextResponse } from 'next/server';
import { getBankProvider } from '@/core/providers/registry';
import { handleRouteError } from '@/server/api-context';

/**
 * Never prerendered.
 *
 * Without this Next statically evaluates the handler at build time and serves
 * that snapshot forever — a data endpoint frozen to whatever the mock ledger
 * looked like when the image was built.
 */
export const dynamic = 'force-dynamic';


/** GET /api/institutions — connectable banks for the link screen. */
export async function GET() {
  try {
    const provider = getBankProvider();
    const institutions = await provider.getInstitutions();
    return NextResponse.json({ provider: provider.key, institutions });
  } catch (error) {
    return handleRouteError(error);
  }
}
