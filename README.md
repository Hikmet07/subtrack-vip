# SubTrack VIP

Subscription intelligence and automated-cancellation platform for the Turkish
market. Connects multiple Turkish bank accounts, detects recurring payments from
raw statement descriptors, scores how likely each one is to have been forgotten,
predicts renewals, tracks price hikes, and generates the exact cancellation path
for the billing rail that actually pulls the money.

The interface is entirely Turkish. The code, comments and documentation are
English.

```bash
npm install
npm run demo    # detection engine + scorecard, no database, no browser
npm run dev     # dashboard at http://localhost:3000
```

---

## 1. Architecture

```
src/core/                    ← pure domain. No React, no Next, no Prisma.
  providers/
    IBankProvider.ts         the aggregation seam
    mock/                    deterministic simulator (7 banks, 24 months)
    registry.ts              where a live adapter gets swapped in
  detection/
    normalization.ts         descriptor -> merchant identity + billing rail
    merchant-dictionary.ts   Turkish merchant/alias/category knowledge base
    periodicity.ts           frequency matrix + aggregator splitting
    price-drift.ts           fixed / FX-drift / stepped / variable
    risk-engine.ts           forgotten ("zombie") scoring, 6 weighted factors
    renewal-predictor.ts     anniversary-accurate next-charge prediction
    engine.ts                orchestrator
  cancellation/
    guides.ts                3-tier guide resolution
    mandate-template.ts      Turkish bank directive generator
    workflow.ts              plan builder + post-cancellation guard
  analytics/dashboard.ts     burn rate, projection, hike radar
  i18n/tr.ts                 every user-facing string
  utils/                     money (kuruş), dates (UTC), robust statistics

src/server/                  ← application services (orchestration + view model)
src/app/api/                 ← HTTP transport (mirrors NestJS controllers)
src/app/, src/components/    ← Next.js App Router UI
prisma/schema.prisma         ← PostgreSQL schema, RLS-ready
```

**Why the core is isolated.** `src/core` has no framework imports at all. That
is what lets `npm run demo` run the entire pipeline under plain `tsx`, lets the
engine be unit-tested without a database, and makes moving the backend to a
NestJS worker or a FastAPI service a transport rewrite rather than a rewrite.

### The provider seam

Everything above `IBankProvider` is written against the interface and nothing
else:

```ts
interface IBankProvider {
  getInstitutions(): Promise<Institution[]>;
  connectAccount(bankId: string, credentials: BankCredentials): Promise<ConnectAccountResult>;
  listAccounts(sessionRef: string): Promise<BankAccount[]>;
  fetchTransactions(accountId, startDate, endDate, options?): Promise<FetchTransactionsPage>;
  cancelStandingOrder?(accountId, mandateRef): Promise<{ accepted: boolean; reference: string }>;
}
```

Going live against AÖH / Paycell / Finrota is one registration:

```ts
registerBankProvider('aoh', () => new AohBankProvider(aohConfigFromEnv()));
```

Contract rules adapters must honour (amounts positive in kuruş, stable
`providerTxnRef`, **verbatim** `rawDescriptor`, ascending order) are documented
on the interface itself.

---

## 2. Detection engine

```
statement lines
  ├─ 1. filter       debits only (credits are refunds and salary)
  ├─ 2. normalise    descriptor -> merchant + billing channel
  ├─ 3. group        by merchant, splitting aggregator rails
  ├─ 4. periodicity  ≥2 consecutive matching intervals, else reject
  ├─ 5. price        fixed / FX-drift / stepped / variable
  ├─ 6. score        detection confidence + forgotten risk
  ├─ 7. predict      next renewal with a stated tolerance window
  └─ 8. alert        renewals, hikes, zombies, duplicate categories
```

### Normalisation

`POS-NETFLIX.COM/BILL 1234 ISTANBUL` → `netflix`. Order is load-bearing: fold
Turkish characters → **detect the channel before stripping prefixes** (the
prefix *is* the channel evidence) → strip rails, references, terminals, cities,
country codes and legal boilerplate → match by override → alias → regex → token
→ fuzzy bigram.

Dictionary aliases are pushed through the same cleaning function at index-build
time, so the dictionary is authored in natural form. Where cleaning makes two
entries collide, **the retail-noise entry wins** — mislabelling a grocery run as
a subscription is far more damaging than missing a membership.

### Periodicity

| Cycle | Nominal | Accepted | Core band |
|---|---|---|---|
| Weekly | 7 | 6–8 | 6–8 |
| Monthly | 30 | 25–36 | 28–32 |
| Quarterly | 91 | 80–100 | 88–94 |
| Semiannual | 182 | 168–196 | 178–186 |
| Yearly | 365 | 348–382 | 360–370 |

Charges within 3 days collapse into one billing event (retry/double charge).
Intervals matching *k×* a cycle count as skipped periods. Median/MAD throughout,
because every real statement has one weird gap. Day-of-month anchoring uses a
**circular** median — a subscription billed on the 31st appears as
`{31, 1, 30, 2}` and a linear median would return 30, nearly a full cycle wrong.

### Price drift — the Turkish-specific problem

Four distinct behaviours that naive detectors conflate:

| Class | Example | Handling |
|---|---|---|
| `FIXED` | ₺299,99 every month | baseline |
| `FX_DRIFT` | ChatGPT Plus: USD 20 billed in lira, ±3% monthly | **not** a hike |
| `STEPPED` | Spotify 59,99 → 99,99 | one hike, timeline preserved |
| `VARIABLE` | İGDAŞ: ₺60 in July, ₺2.400 in January | consumption, not price |

The discriminator is *sustain*, not magnitude: a hike holds its new level,
seasonality does not. A step must exceed 6,5% **and** persist. This is why the
Price Hike Radar does not fire twelve times a year on every USD-priced service.

### Aggregator splitting

`APPLE.COM/BILL` covers every in-app purchase the user has. Reporting
"Apple — ₺230/ay" is useless for cancellation, so streams on an aggregator rail
are split by billing anniversary (Apple charges each product on its own day of
the month). Products that genuinely share an anniversary are inseparable from
the statement alone; those are flagged `needsUserLabel` rather than guessed at,
and their usage-based risk factors are suppressed — *no engagement data* is not
the same thing as *not being used*.

### Forgotten-risk score

Additive 0–100 across six weighted factors, chosen over a learned model so every
point is explainable in one Turkish sentence:

| Factor | Weight |
|---|---|
| Dormancy (months since last interaction) | 30 |
| Never engaged | 10 |
| Silent renewals since last use | 20 |
| Price creep vs. sign-up price | 15 |
| Same-category overlap | 15 |
| Share of total monthly burn | 10 |

Bands: `LOW` <25, `MODERATE` <50, `HIGH` <75, `CRITICAL` ≥75. Variable utility
bills are exempt — you cannot forget to cancel electricity.

---

## 3. Cancellation

**The cancel path is determined by the billing rail, not the brand.** Netflix
bought through the App Store cannot be cancelled on netflix.com. Guides resolve
in three tiers — `merchant × channel` → `category × channel` → `channel` — so
there is never a dead end.

For `BANK_STANDING_ORDER`, a formal Turkish directive is generated with the
account suffix, beneficiary, mandate reference and effective date, plus an
explicit clause separating *mandate cancellation* from *contract termination* —
users routinely believe these are the same thing and get a debt notice.

The **post-cancellation guard** stays armed for one cycle + 30 days (60-day
floor) and re-matches through the full normaliser, because merchants often
change their descriptor after a dispute.

---

## 4. Data model

`prisma/schema.prisma`. Notable decisions:

- Money is `Decimal(14,2)`, never `Float`.
- Every tenant-scoped table carries a denormalised `userId` even when reachable
  through a parent — a PostgreSQL RLS policy must be evaluable from the row
  itself without a join.
- Credentials are never stored: only an opaque `providerAccountRef` and an
  encrypted refresh-token envelope.
- Detection output is materialised into `Subscription` with a
  `detectionSnapshot` JSON audit trail, so every figure on the dashboard is
  explainable after the fact.
- `Alert.dedupeKey` prevents the same alert being re-raised on every run.

```bash
npm run db:generate && npm run db:push   # requires DATABASE_URL
```

---

## 5. Interface

Dark-by-design private-banking aesthetic: obsidian ground (`#070709`), a single
champagne-gold accent ramp, three semantic hues only (emerald = savings, indigo
= insight, rose = risk). Frosted glass panels over a fixed gold veil and a 2%
film grain — the grain is the cheapest thing in `globals.css` and the most
load-bearing, since without it large dark gradients band visibly on OLED
displays.

Formatting happens **on the server**. Components receive pre-formatted Turkish
strings, because running `Intl` on both sides risks a hydration mismatch, which
on a financial dashboard looks like numbers flickering to different values.

The dashboard page is a Server Component; only the charts, drawer and filters
ship to the client.

---

## 6. HTTP API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/institutions` | connectable banks |
| `POST` | `/api/accounts/connect` | establish consent (`428` when an OTP is required) |
| `GET` | `/api/subscriptions` | detection output + candidates + alerts |
| `GET` | `/api/analytics` | burn rate, categories, projection, hike radar |
| `POST` | `/api/cancellations` | resolve a cancellation plan + directive |
| `PUT` | `/api/cancellations` | post-cancellation guard sweep |

Mock credentials: any customer number, any password ≥4 chars. Garanti BBVA,
İş Bankası and Akbank additionally require OTP `123456`.

---

## 7. Verification

`npm run demo` runs the full pipeline and scores it against the generator's
ground truth, exiting non-zero below 85% recall or 90% precision — usable
directly in CI.

Current run (seed `subtrack-vip-1071`, reference date 17 Ağustos 2026):

```
1.590 transactions scanned · 1.185 noise filtered · 20 subscriptions · ~110 ms
Recall     18/18  100.0%
Precision  18/18  100.0%
Noise      11/11 merchants correctly ignored
Aggregator  2 streams resolved (iCloud+, Disney+ — names to come from the user)
```

Edge cases the fixture deliberately contains: a price hike mid-stream, FX-linked
monthly drift, severe utility seasonality, an annual cycle with only three data
points, a stream with exactly three charges (the classification floor), a card
migration between two banks, a double charge plus refund, a lapsed subscription,
`TRENDYOL PREMIUM` vs. `TRENDYOL SIPARIS`, and ~1.200 lines of retail noise.

## Configuration

```bash
DATABASE_URL="postgresql://..."      # only needed for Prisma
SUBTRACK_MOCK_SEED="1071"            # same seed => identical dataset
SUBTRACK_MOCK_NOW="2026-08-17"       # pin the reference date
SUBTRACK_BANK_PROVIDER="mock"        # mock | aoh | paycell | finrota
```
