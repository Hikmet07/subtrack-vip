import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildCancellationPlan, detectRogueCharges, buildRogueChargeAlerts } from '@/core/cancellation/workflow';
import { getBankProvider } from '@/core/providers/registry';
import { MockBankProvider } from '@/core/providers/mock/MockBankProvider';
import { apiError, handleRouteError, runDetection } from '@/server/api-context';

const PlanSchema = z.object({
  merchantKey: z.string().min(1),
  customerName: z.string().min(1).default('Hesap Sahibi'),
  nationalId: z.string().length(11).optional(),
  /** Set once the user confirms they have already terminated the contract. */
  contractTerminated: z.boolean().default(false),
});

/**
 * POST /api/cancellations
 *
 * Resolves the cancellation plan for one subscription: the correct guide for
 * its billing rail, the caveats, the expected saving, the guard window, and —
 * for bank standing orders — the rendered directive letter.
 */
export async function POST(request: NextRequest) {
  try {
    const body = PlanSchema.parse(await request.json());
    const { detection, now } = await runDetection();

    const subscription = detection.subscriptions.find(
      (candidate) => candidate.merchantKey === body.merchantKey,
    );
    if (!subscription) {
      return apiError('SUBSCRIPTION_NOT_FOUND', 'Abonelik bulunamadı.', 404);
    }

    const provider = getBankProvider();
    const accounts = provider instanceof MockBankProvider ? provider.getAllAccounts() : [];
    const account = accounts.find((entry) => entry.id === subscription.primaryAccountId);

    const plan = buildCancellationPlan({
      subscription,
      account,
      customerName: body.customerName,
      nationalId: body.nationalId,
      contractTerminated: body.contractTerminated,
      now,
    });

    return NextResponse.json(plan);
  } catch (error) {
    return handleRouteError(error);
  }
}

const GuardSchema = z.object({
  guarded: z
    .array(
      z.object({
        merchantKey: z.string().min(1),
        merchantName: z.string().min(1),
        cancelledAt: z.coerce.date(),
        guardUntil: z.coerce.date(),
        expectedAmount: z.number().nonnegative(),
      }),
    )
    .min(1),
});

/**
 * PUT /api/cancellations — post-cancellation guard sweep.
 *
 * Given the merchants the user has cancelled, re-scans the statement window for
 * charges that arrived anyway. This is the endpoint a nightly worker calls
 * after each sync; it is exposed over HTTP so the client can force a check
 * immediately after the user marks a cancellation complete.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = GuardSchema.parse(await request.json());
    const { transactions, now } = await runDetection();

    const findings = detectRogueCharges(body.guarded, transactions, now);
    return NextResponse.json({
      findings,
      alerts: buildRogueChargeAlerts(findings, now),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
