/**
 * Provider registry — the single place where a concrete bank adapter is chosen.
 *
 * Everything else in the codebase depends on `IBankProvider`, never on
 * `MockBankProvider`. Going live against Turkish open banking is therefore a
 * matter of implementing the interface and registering it here:
 *
 *     registerBankProvider('aoh', () => new AohBankProvider({ ... }));
 *
 * The stubs below are intentionally present but unregistered — they document
 * the intended integration targets without pretending to be implemented.
 */

import type { IBankProvider } from './IBankProvider';
import { MockBankProvider } from './mock/MockBankProvider';

export type BankProviderFactory = () => IBankProvider;

const registry = new Map<string, BankProviderFactory>();
const singletons = new Map<string, IBankProvider>();

export function registerBankProvider(key: string, factory: BankProviderFactory): void {
  registry.set(key, factory);
}

/**
 * Resolves a provider, memoising the instance.
 *
 * The mock provider is memoised for a functional reason, not just performance:
 * it holds the generated ledger in memory, and a fresh instance per request
 * would hand the UI a different (if equally deterministic) universe on every
 * navigation.
 */
export function getBankProvider(key?: string): IBankProvider {
  const resolved = key ?? process.env.SUBTRACK_BANK_PROVIDER ?? 'mock';
  const existing = singletons.get(resolved);
  if (existing) return existing;

  const factory = registry.get(resolved);
  if (!factory) {
    throw new Error(
      `No bank provider registered for "${resolved}". Registered: ${[...registry.keys()].join(', ') || '(none)'}`,
    );
  }
  const instance = factory();
  singletons.set(resolved, instance);
  return instance;
}

/** Test helper — drops memoised instances so a new seed takes effect. */
export function resetBankProviders(): void {
  singletons.clear();
}

// -----------------------------------------------------------------------------
//  Default registrations
// -----------------------------------------------------------------------------

registerBankProvider(
  'mock',
  () =>
    new MockBankProvider({
      seed: process.env.SUBTRACK_MOCK_SEED ?? 'subtrack-vip-1071',
      // Pinned reference date keeps screenshots, demos and tests reproducible.
      now: process.env.SUBTRACK_MOCK_NOW ? new Date(process.env.SUBTRACK_MOCK_NOW) : undefined,
      latencyMs: process.env.NODE_ENV === 'production' ? 0 : 0,
    }),
);

// Future adapters — implement `IBankProvider` and register here.
//
// registerBankProvider('aoh',     () => new AohBankProvider(aohConfigFromEnv()));
// registerBankProvider('paycell', () => new PaycellBankProvider(paycellConfigFromEnv()));
// registerBankProvider('finrota', () => new FinrotaBankProvider(finrotaConfigFromEnv()));
