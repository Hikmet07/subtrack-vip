/**
 * Deterministic in-memory implementation of `IBankProvider`.
 *
 * The whole multi-bank universe (institutions, accounts, 24 months of ledger)
 * is materialised **once** from the seed at construction time. Building it
 * up-front rather than per-connect matters: the transaction generator routes a
 * merchant to an account by drawing from the account pool, so a ledger built
 * incrementally would reshuffle previously-issued transaction references every
 * time a new bank was linked — and idempotent upsert would break.
 *
 * The simulated persona holds accounts at four of the seven institutions,
 * which is what a real multi-banked Istanbul professional looks like. The other
 * three are connectable and simply return no history.
 */

import type {
  BankAccount,
  BankCredentials,
  ConnectAccountResult,
  EngagementSignal,
  Institution,
  ProviderTransaction,
} from '../../types';
import {
  BankProviderError,
  type FetchTransactionsOptions,
  type FetchTransactionsPage,
  type IBankProvider,
} from '../IBankProvider';
import { addDays, atNoonUTC } from '../../utils/date';
import { lira } from '../../utils/money';
import { SeededRandom } from '../../utils/rng';
import { MOCK_INSTITUTIONS, findInstitution } from './institutions';
import { generateLedger, type GroundTruthStream } from './transaction-generator';

/** Institutions whose login flow demands an SMS one-time password. */
const OTP_INSTITUTIONS = new Set(['garanti-bbva', 'is-bankasi', 'akbank']);

/** The only OTP the simulator accepts. Documented, not secret. */
export const MOCK_OTP = '123456';

const CONSENT_VALIDITY_DAYS = 90;

interface PersonaAccountSpec {
  institutionId: string;
  displayName: string;
  accountType: BankAccount['accountType'];
  balance: number;
}

/**
 * The demo persona's real account mix. Order matters: the generator routes
 * standing orders to `checking[0]`, so the Garanti current account must come
 * first for the utility bills to land somewhere believable.
 */
const PERSONA_ACCOUNTS: PersonaAccountSpec[] = [
  { institutionId: 'garanti-bbva', displayName: 'Bonus Platinum', accountType: 'CREDIT_CARD', balance: -18_450.32 },
  { institutionId: 'garanti-bbva', displayName: 'Vadesiz TL Hesabı', accountType: 'CHECKING', balance: 64_920.18 },
  { institutionId: 'yapi-kredi', displayName: 'World Elite', accountType: 'CREDIT_CARD', balance: -7_310.9 },
  { institutionId: 'is-bankasi', displayName: 'Maximum Kart', accountType: 'CREDIT_CARD', balance: -3_988.4 },
  { institutionId: 'enpara', displayName: 'Enpara Vadesiz', accountType: 'CHECKING', balance: 121_400.0 },
  { institutionId: 'papara', displayName: 'Papara Hesabı', accountType: 'PREPAID', balance: 2_140.75 },
];

export interface MockBankProviderOptions {
  seed?: string | number;
  /** Reference "today". Injectable so tests are not time-dependent. */
  now?: Date;
  historyMonths?: number;
  /** Simulated network latency in ms. Set to 0 in tests. */
  latencyMs?: number;
}

export class MockBankProvider implements IBankProvider {
  readonly key = 'mock';
  readonly displayName = 'SubTrack Simülatörü';

  private readonly rng: SeededRandom;
  private readonly now: Date;
  private readonly latencyMs: number;

  private readonly accounts: BankAccount[];
  private readonly accountsById = new Map<string, BankAccount>();
  private readonly ledger: ProviderTransaction[];
  private readonly ledgerByAccount = new Map<string, ProviderTransaction[]>();

  /** Exposed for the risk engine and for scoring the detector in the demo. */
  readonly engagementSignals: EngagementSignal[];
  readonly groundTruth: GroundTruthStream[];

  private readonly sessions = new Map<string, string[]>();

  constructor(options: MockBankProviderOptions = {}) {
    const seed = options.seed ?? 'subtrack-vip-1071';
    this.rng = new SeededRandom(`${seed}:accounts`);
    this.now = atNoonUTC(options.now ?? new Date());
    this.latencyMs = options.latencyMs ?? 0;

    this.accounts = this.buildAccounts();
    for (const account of this.accounts) this.accountsById.set(account.id, account);

    const generated = generateLedger({
      seed: `${seed}:ledger`,
      accounts: this.accounts,
      now: this.now,
      historyMonths: options.historyMonths ?? 24,
    });

    this.ledger = generated.transactions;
    this.engagementSignals = generated.engagementSignals;
    this.groundTruth = generated.groundTruth;

    for (const txn of this.ledger) {
      const bucket = this.ledgerByAccount.get(txn.accountId);
      if (bucket) bucket.push(txn);
      else this.ledgerByAccount.set(txn.accountId, [txn]);
    }
  }

  // ---------------------------------------------------------------------------
  //  IBankProvider
  // ---------------------------------------------------------------------------

  async getInstitutions(): Promise<Institution[]> {
    await this.delay();
    return MOCK_INSTITUTIONS;
  }

  async connectAccount(
    bankId: string,
    credentials: BankCredentials,
  ): Promise<ConnectAccountResult> {
    await this.delay();

    const institution = findInstitution(bankId);
    if (!institution) {
      throw new BankProviderError(
        'INSTITUTION_UNAVAILABLE',
        `Unknown institution: ${bankId}`,
        'Bu banka şu anda desteklenmiyor.',
      );
    }

    if (!credentials.customerNumber || credentials.password.length < 4) {
      throw new BankProviderError(
        'INVALID_CREDENTIALS',
        'Customer number or password rejected',
        'Müşteri numarası veya şifre hatalı. Lütfen tekrar deneyin.',
      );
    }

    if (OTP_INSTITUTIONS.has(bankId)) {
      if (!credentials.otp) {
        throw new BankProviderError(
          'OTP_REQUIRED',
          'One-time password required',
          'Kayıtlı telefonunuza gönderilen tek kullanımlık şifreyi girin.',
          true,
        );
      }
      if (credentials.otp !== MOCK_OTP) {
        throw new BankProviderError(
          'OTP_INVALID',
          'One-time password rejected',
          'Girdiğiniz doğrulama kodu geçersiz.',
          true,
        );
      }
    }

    const accounts = this.accounts.filter((account) => account.institutionId === bankId);
    const consentExpiresAt = addDays(this.now, CONSENT_VALIDITY_DAYS);
    const sessionRef = `mock-sess-${bankId}-${this.rng.int(100_000, 999_999)}`;

    this.sessions.set(
      sessionRef,
      accounts.map((account) => account.id),
    );

    return {
      accounts: accounts.map((account) => ({
        ...account,
        syncStatus: 'ACTIVE',
        consentExpiresAt,
        lastSyncedAt: this.now,
      })),
      consentExpiresAt,
      sessionRef,
    };
  }

  async listAccounts(sessionRef: string): Promise<BankAccount[]> {
    await this.delay();
    const ids = this.sessions.get(sessionRef);
    if (!ids) {
      throw new BankProviderError(
        'CONSENT_EXPIRED',
        `Unknown session: ${sessionRef}`,
        'Banka bağlantınızın süresi doldu. Lütfen yeniden onay verin.',
      );
    }
    return ids.map((id) => this.accountsById.get(id)!).filter(Boolean);
  }

  async fetchTransactions(
    accountId: string,
    startDate: Date,
    endDate: Date,
    options: FetchTransactionsOptions = {},
  ): Promise<FetchTransactionsPage> {
    await this.delay();

    if (!this.accountsById.has(accountId)) {
      throw new BankProviderError(
        'UNKNOWN_ACCOUNT',
        `Unknown account: ${accountId}`,
        'Hesap bulunamadı.',
      );
    }

    const all = (this.ledgerByAccount.get(accountId) ?? []).filter(
      (txn) => txn.bookedAt >= startDate && txn.bookedAt <= endDate,
    );

    const offset = options.cursor ? Number.parseInt(options.cursor, 10) : 0;
    const limit = options.limit ?? 500;
    const slice = all.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;

    return {
      transactions: slice,
      hasMore: nextOffset < all.length,
      nextCursor: nextOffset < all.length ? String(nextOffset) : undefined,
    };
  }

  async cancelStandingOrder(
    accountId: string,
    mandateRef: string,
  ): Promise<{ accepted: boolean; reference: string }> {
    await this.delay();
    const account = this.accountsById.get(accountId);
    const institution = account ? findInstitution(account.institutionId) : undefined;

    if (!institution?.supportsStandingOrderCancellation) {
      return { accepted: false, reference: '' };
    }
    return {
      accepted: true,
      reference: `IPT-${mandateRef}-${this.rng.int(10_000, 99_999)}`,
    };
  }

  // ---------------------------------------------------------------------------
  //  Simulator-only helpers (not part of IBankProvider)
  // ---------------------------------------------------------------------------

  /** Every account in the persona, as if all banks were already linked. */
  getAllAccounts(): BankAccount[] {
    return this.accounts.map((account) => ({
      ...account,
      syncStatus: 'ACTIVE' as const,
      lastSyncedAt: this.now,
      consentExpiresAt: addDays(this.now, CONSENT_VALIDITY_DAYS),
    }));
  }

  /** The complete ledger, sorted ascending — convenience for the demo script. */
  getFullLedger(): ProviderTransaction[] {
    return this.ledger;
  }

  getReferenceDate(): Date {
    return this.now;
  }

  // ---------------------------------------------------------------------------
  //  Internals
  // ---------------------------------------------------------------------------

  private buildAccounts(): BankAccount[] {
    return PERSONA_ACCOUNTS.map((spec, index) => {
      const institution = findInstitution(spec.institutionId)!;
      const last4 = String(this.rng.int(1000, 9999));
      const isCard = spec.accountType === 'CREDIT_CARD' || spec.accountType === 'PREPAID';

      return {
        id: `acc-${spec.institutionId}-${index}`,
        institutionId: institution.id,
        institutionName: institution.displayName,
        brandColor: institution.brandColor,
        providerAccountRef: `${institution.logoSlug.toUpperCase()}${this.rng.int(100_000, 999_999)}`,
        displayName: spec.displayName,
        accountType: spec.accountType,
        maskedNumber: isCard ? `**** ${last4}` : `TR** **** ${last4}`,
        ibanSuffix: isCard ? undefined : last4,
        currency: 'TRY',
        balance: lira(spec.balance),
        availableBalance: lira(spec.balance > 0 ? spec.balance : 0),
        syncStatus: 'ACTIVE',
      } satisfies BankAccount;
    });
  }

  private async delay(): Promise<void> {
    if (this.latencyMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}
