/**
 * Shared request-scoped plumbing for the HTTP layer.
 *
 * These Route Handlers are the thin transport tier. Every one of them does the
 * same three things — validate input, call a pure core function, serialise the
 * result — which is exactly the shape a NestJS controller would have. Moving to
 * a standalone Nest or FastAPI service therefore means re-implementing this
 * file and nothing else.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { detectSubscriptions } from '@/core/detection/engine';
import { getBankProvider } from '@/core/providers/registry';
import { MockBankProvider } from '@/core/providers/mock/MockBankProvider';
import { BankProviderError } from '@/core/providers/IBankProvider';
import type { DetectionResult, ProviderTransaction } from '@/core/types';
import { addMonthsClamped } from '@/core/utils/date';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/**
 * Maps a provider failure onto an HTTP response.
 *
 * `userMessage` is Turkish and safe to render directly; `message` is English
 * and for logs only. Keeping the two separate is what stops an internal string
 * ever reaching a customer's screen.
 */
export function handleRouteError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof BankProviderError) {
    const status =
      error.code === 'INVALID_CREDENTIALS' || error.code === 'OTP_INVALID'
        ? 401
        : error.code === 'OTP_REQUIRED'
          ? 428 // Precondition Required — the client must collect an OTP
          : error.code === 'RATE_LIMITED'
            ? 429
            : error.code === 'UNKNOWN_ACCOUNT'
              ? 404
              : 502;
    return apiError(error.code, error.userMessage, status, { retryable: error.retryable });
  }

  if (error instanceof z.ZodError) {
    return apiError('VALIDATION_FAILED', 'İstek gövdesi geçersiz.', 422, error.flatten());
  }

  console.error('[api] unhandled error', error);
  return apiError('INTERNAL_ERROR', 'Beklenmeyen bir hata oluştu.', 500);
}

/**
 * Pulls the full statement window and runs detection.
 *
 * In production this would read materialised `Subscription` rows written by a
 * nightly worker rather than re-detecting per request. The mock provider holds
 * everything in memory, so recomputing costs ~100 ms and keeps the demo free of
 * a database dependency — a trade documented here rather than hidden.
 */
export async function runDetection(): Promise<{
  detection: DetectionResult;
  transactions: ProviderTransaction[];
  now: Date;
}> {
  const provider = getBankProvider();
  const accounts =
    provider instanceof MockBankProvider
      ? provider.getAllAccounts()
      : await provider.listAccounts('default');

  const now = provider instanceof MockBankProvider ? provider.getReferenceDate() : new Date();
  const windowStart = addMonthsClamped(now, -24);

  const transactions: ProviderTransaction[] = [];
  for (const account of accounts) {
    let cursor: string | undefined;
    do {
      const page = await provider.fetchTransactions(account.id, windowStart, now, {
        limit: 500,
        cursor,
      });
      transactions.push(...page.transactions);
      cursor = page.nextCursor;
    } while (cursor);
  }

  const engagementSignals =
    provider instanceof MockBankProvider ? provider.engagementSignals : undefined;

  return {
    detection: detectSubscriptions({ transactions, engagementSignals, now }),
    transactions,
    now,
  };
}
