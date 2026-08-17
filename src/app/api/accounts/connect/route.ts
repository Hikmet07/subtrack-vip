import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getBankProvider } from '@/core/providers/registry';
import { handleRouteError } from '@/server/api-context';

const ConnectSchema = z.object({
  bankId: z.string().min(1),
  customerNumber: z.string().min(1),
  password: z.string().min(1),
  otp: z.string().optional(),
});

/**
 * POST /api/accounts/connect
 *
 * Establishes bank consent. Credentials are forwarded straight to the provider
 * and never persisted, logged, or echoed back — the response carries only an
 * opaque `sessionRef` and the resulting account list.
 *
 * A missing OTP comes back as 428 rather than 401 so the client can tell
 * "we need a second factor" apart from "your password is wrong".
 */
export async function POST(request: NextRequest) {
  try {
    const body = ConnectSchema.parse(await request.json());
    const provider = getBankProvider();

    const result = await provider.connectAccount(body.bankId, {
      customerNumber: body.customerNumber,
      password: body.password,
      otp: body.otp,
    });

    return NextResponse.json({
      sessionRef: result.sessionRef,
      consentExpiresAt: result.consentExpiresAt,
      accounts: result.accounts,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
