/**
 * The bank aggregation seam.
 *
 * Everything above this interface — detection, analytics, cancellation, UI —
 * is written against `IBankProvider` and nothing else. Swapping the deterministic
 * simulator for a live Turkish open-banking gateway (AÖH), Paycell or Finrota is
 * therefore a registry change, not a refactor.
 *
 * Contract rules every implementation must honour:
 *
 *  1. `amount` is a **positive** integer in kuruş; direction carries the sign.
 *  2. `providerTxnRef` is stable across re-fetches, so callers can upsert
 *     idempotently. If an upstream API does not supply one, the adapter must
 *     synthesise a deterministic hash of (account, date, amount, descriptor).
 *  3. `rawDescriptor` is passed through **verbatim**. Adapters must not clean,
 *     trim or title-case it — normalisation is the engine's job and must stay
 *     re-runnable from the original text.
 *  4. `fetchTransactions` is inclusive of `startDate` and `endDate` and returns
 *     results sorted ascending by `bookedAt`.
 *  5. Credentials are never persisted by the adapter. Anything that must
 *     survive the call is returned inside `ConnectAccountResult.sessionRef`.
 */

import type {
  BankAccount,
  BankCredentials,
  ConnectAccountResult,
  Institution,
  ProviderTransaction,
} from '../types';

export interface FetchTransactionsOptions {
  /** Hard cap; adapters should page internally rather than truncate silently. */
  limit?: number;
  /** Opaque continuation token for adapters with cursor pagination. */
  cursor?: string;
}

export interface FetchTransactionsPage {
  transactions: ProviderTransaction[];
  nextCursor?: string;
  hasMore: boolean;
}

export interface IBankProvider {
  /** Stable identifier, e.g. "mock" | "aoh" | "paycell" | "finrota". */
  readonly key: string;
  readonly displayName: string;

  /** Institutions the user can pick from on the connect screen. */
  getInstitutions(): Promise<Institution[]>;

  /**
   * Establishes consent and returns the accounts it covers.
   * Implementations should throw `BankProviderError` with a machine-readable
   * `code` rather than a bare `Error`, so the UI can branch on OTP / lockout.
   */
  connectAccount(bankId: string, credentials: BankCredentials): Promise<ConnectAccountResult>;

  /** Accounts already covered by an existing consent. */
  listAccounts(sessionRef: string): Promise<BankAccount[]>;

  fetchTransactions(
    accountId: string,
    startDate: Date,
    endDate: Date,
    options?: FetchTransactionsOptions,
  ): Promise<FetchTransactionsPage>;

  /**
   * Optional: cancel a standing order (otomatik ödeme talimatı) directly.
   * Only a handful of Turkish institutions expose this over open banking, so
   * callers must feature-detect via `Institution.supportsStandingOrderCancellation`
   * and fall back to the generated directive letter.
   */
  cancelStandingOrder?(accountId: string, mandateRef: string): Promise<{ accepted: boolean; reference: string }>;
}

export type BankProviderErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'OTP_REQUIRED'
  | 'OTP_INVALID'
  | 'ACCOUNT_LOCKED'
  | 'CONSENT_EXPIRED'
  | 'INSTITUTION_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNKNOWN_ACCOUNT';

export class BankProviderError extends Error {
  constructor(
    readonly code: BankProviderErrorCode,
    message: string,
    /** Turkish message safe to surface directly in the UI. */
    readonly userMessage: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'BankProviderError';
  }
}
