# Points Wallet — Spec

This is the contract the build follows. Every feature has a check that runs before its diff is reviewed.

## 1. User and pain

A Canadian household with loyalty points scattered across 6–15 programs can't see their combined value or decide whether a redemption is good. The product is a single wallet that aggregates balances in CAD and calculates effective ¢/pt for a specific trip.

The builder is the user: a points maximizer who books with Aeroplan and Flying Blue and also juggles PC Optimum, Scene+ and Sephora. The value is aggregation plus decision support; the calculator is the decision-support engine.

## 2. Core contract: the redemption calculator

**Contract:** given a cash price, a list of points options, and transfer ratios, the calculator returns a ranked list of options by effective ¢/pt, with a verdict against the household's target value. It is a pure function in `app/lib/calculator.ts`, with no I/O, and the UI and tRPC layer both import it.

**Input**

```ts
type PointsOption = {
  id: string;
  label: string;               // "Flying Blue via Amex MR"
  program: ProgramId;          // program the award is booked in
  points: number;              // award price in that program's points, integer > 0
  feesCents: number;           // cash taxes/fees on the award, integer >= 0
  source?: { program: ProgramId; ratio: number }; // transfer: 1 source pt -> ratio award pts
  ownerUserId?: string;        // whose balance pays for it
};
type CalcInput = {
  cashPriceCents: number;                        // integer > 0
  options: PointsOption[];
  targetCpp: Partial<Record<ProgramId, number>>; // household overrides; fall back to catalog default
  catalog: Record<ProgramId, { shortName: string; cpp?: number }>; // injected; the tRPC layer fills it from the loader
  balances?: { userId: string; program: ProgramId; points: number | null }[];
};
```

The catalog is injected, not imported, so the calculator stays pure and tests pass their own values.

**Math, per option** (money in integer cents; ¢/pt kept unrounded for ranking, rounded to 2 dp for display)

1. `spentProgram` = `source.program` if transferred, else `program`.
2. `sourcePoints` = `ceil(points / ratio)` if transferred, else `points`.
3. `savedCents` = `cashPriceCents − feesCents`.
4. `cpp` = `savedCents / sourcePoints`.
5. `target` = household override for `spentProgram`, else the injected catalog's `cpp`, else none.
6. `margin` = `cpp − target`.

```
cpp = (cash price − taxes and fees) / points spent
points spent = ceil(award points / transfer ratio)
```

**Basis: TPG's redemption value formula.** [The Points Guy](https://thepointsguy.com/loyalty-programs/calculate-redemption-values) defines redemption value as (cash price − taxes and fees) ÷ points used × 100. This spec uses that formula unchanged, with two notes:

- **No ×100.** TPG's ×100 turns dollars into cents. Money here is already in cents, so the division gives ¢/pt directly.
- **Transfer ratio in the denominator.** TPG has no transfer term. Here, "points used" means the points that leave your account, so 15,000 Cathay Asia Miles bought with Amex MR at 1:0.75 costs 20,000 MR. With no transfer the ratio is 1 and the result is identical to TPG's.

Mixed points-and-cash awards follow TPG too: the cash portion goes into `feesCents`.

**Verdict**

| Condition | Verdict |
| --- | --- |
| `savedCents ≤ 0` | `PAY_CASH`, reason "fees exceed cash price" |
| `cpp ≥ target` | `USE_POINTS` |
| `0.9 × target ≤ cpp < target` | `BORDERLINE` |
| `cpp < 0.9 × target` | `PAY_CASH` |
| no target available | `UNRATED` (still ranked by cpp) |

**Ranking:** `cpp` descending, then `margin` descending, then `sourcePoints` ascending, then input order. Options the paying member can't afford are left out of the ranking and returned separately as `outOfReach`, each with `shortBy` (points still needed to meet the award price).

**Output, per ranked option:** rank, cpp, savedCents, sourcePoints, spentProgram, target (and whether it's an override or a catalog default), margin, verdict, plus a `formula` string, e.g. `($480.00 − $120.00) ÷ 15,000 Amex MR = 2.40¢/pt`. The program name in the formula is the catalog's `shortName` for `spentProgram`.

**Recommendation:** top-level `recommendation: { verdict, optionId? }` is the top-ranked option's verdict and id, or `PAY_CASH` with no id when the ranking is empty.

**Out of reach, per option:** `shortBy` (points the paying member still needs), plus household cover:

- `householdHoldings`: every other member's balance in `spentProgram`, e.g. "Partner holds 25,000 Amex MR."
- `coveredByHousehold`: `true` when the paying member's balance plus the others' reaches `sourcePoints`.
- The UI labels cover as informational: whether points can move between members depends on each program's rules.

**Unknown balances:** if the paying member's balance is unknown (or no owner is set), the option stays ranked and is flagged `balanceUnknown`. The calculator never guesses a balance.

### Golden test: Edmonton for Christmas

Fixture values are real as of 2026-11-03 (ratio from Amex Canada, targets from Prince of Travel Q2 2026), but they are copied into the test, so the test never changes when the catalog does. Cash price: Flair $400 + $80 carry-on = **$480.00**. Targets: Aeroplan 2.0¢, Amex MR 2.2¢. No balances.

| Option | Award | Fees | Spent | ¢/pt | Target | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| A: Aeroplan from Aeroplan balance | 30,000 Aeroplan | $90 | 30,000 Aeroplan | 1.30 | 2.0 | PAY_CASH |
| B: Flying Blue via Amex MR (1:1) | 15,000 Flying Blue | $120 | 15,000 Amex MR | 2.40 | 2.2 | USE_POINTS |
| C: Aeroplan via Amex MR (1:1) | 30,000 Aeroplan | $90 | 30,000 Amex MR | 1.30 | 2.2 | PAY_CASH |

**Expected ranked order: B, A, C.** A and C tie at 1.30¢, and A ranks ahead on margin (−0.70 vs. −0.90). Burning flexible Amex MR at a poor rate wastes more value than spending Aeroplan directly, which is the call a points maximizer would make. This tie-break is the non-obvious rule the test pins down.

### Edge-case tests

1. Fees ≥ cash price → `cpp ≤ 0`, `PAY_CASH` with reason, ranked last.
2. `points ≤ 0`, `ratio ≤ 0`, or `cashPriceCents ≤ 0` → zod validation error, no result.
3. Transfer rounding: 15,001 award points at ratio 0.75 → `sourcePoints` = 20,002.
4. No override and no catalog default → `UNRATED`, still ranked by cpp.
5. Owner holds 10,000 Amex MR against a 15,000 need → option moves to `outOfReach` with `shortBy` = 5,000; the remaining options re-rank without it. If the partner holds 5,000 Amex MR, `coveredByHousehold` is true (10,000 + 5,000 ≥ 15,000). If the owner's balance is unknown, the option stays ranked with `balanceUnknown`.
6. Empty options → empty list. Every option out of reach → empty ranking, recommendation is to pay cash, and `outOfReach` lists what each would need.

## 3. Trust mechanism

Every calculated value shows its inputs (points, fees, transfer ratio) so the user can inspect the math. The forgotten-points finder returns program suggestions with a recovery URL, not just a label.

- **Calculator rows** show the `formula` string under each ¢/pt, plus where the target came from: "your target" or "catalog default."
- **Net worth** shows each line as `points × ¢/pt = $`, with the valuation source and as-of date beside it. Unknown balances are listed but excluded from the total, and the total says so ("1 program with an unknown balance").
- **Finder results** carry: program name, the answer that triggered it ("you said you order pizza"), the account identifier to try (email, phone, card number), and an `https` recovery URL.
- **Verifiable:** a unit test asserts every catalog entry has an `https` recovery URL and a finder question that exists.

The finder is a deterministic questionnaire, not an LLM feature. It doesn't need one.

## 4. Scope

Auth and household creation are must-haves. Gift cards with expiry dates are out of scope for this build; the wallet shows an empty state for them.

**Must-have**

| Feature | Done when |
| --- | --- |
| Auth | Template's Better Auth sign-up/login works on the deployed URL |
| Household | A user creates a household; a second user joins with a 6-character invite code; both see the same wallet |
| Wallet + net worth | Members add balances (or "unknown") per program; total in CAD with per-line math; filter by category |
| Target overrides | A household sets its own ¢/pt target per program (e.g. Aeroplan 5¢ for business class) |
| Redemption calculator | Golden test passes; UI renders B, A, C with formula strings; shortfall flagged from real balances |
| Forgotten-points finder | 5 questions return suggestions with recovery URLs; one click adds each as an unknown balance |

**Nice-to-have, if time allows:** save calculator scenarios to revisit; prefill calculator options from the household's balances; "one order away from a free pizza" progress for count-based programs.

**Cut, on purpose**

| Cut | Why |
| --- | --- |
| Gift cards and vouchers | Different data shape (expiry, codes); empty state only |
| Email invites | Needs an email provider; invite codes prove the household model |
| Loyalty-program APIs and screenshot import | No public APIs for most Canadian programs; the template's Workers AI binding makes screenshot import a clean follow-up |
| Promo timing and forecasting | Needs historical data we don't have |
| Transfer bonuses and increment rounding | Real but secondary; the ratio model extends to both |
| Live valuation feeds | Catalog defaults plus household overrides are honest and inspectable |
| "Spend $X to close the gap" | Needs buy-points prices or card earn rates, neither in the data model; points short is exact today |

## 5. Stack and constraints

Built on [Casper-Studios/takehome-assignment-ts](https://github.com/Casper-Studios/takehome-assignment-ts) as-is; auth, sign-up/login pages, a dashboard shell and shadcn components come with it.

| Layer | What the template gives you |
| --- | --- |
| Runtime + deploy | Cloudflare Workers via Wrangler (`bun run deploy`) |
| Framework | React Router 7, SSR, Vite |
| API | tRPC v11 with `publicProcedure` / `protectedProcedure` in `app/trpc/index.ts` |
| Auth | Better Auth, email + password, routes at `/login`, `/sign-up`, `/api/auth/*` |
| Database | D1 (SQLite) through Drizzle; schema in `app/db/schema.ts`, migrations in `drizzle/` |
| UI | Tailwind 4 + shadcn: card, table, tabs, select, badge, chart, sidebar |
| Package manager | **bun** (scripts call `bun run` and `bunx`) |
| Tests | None in the template. Vitest is added for `app/lib/` and `app/data/` |

**Things to know**

- `bun run setup` needs a Cloudflare account, `wrangler login`, R2 enabled and a workers.dev subdomain. It creates a D1 database and an R2 bucket, writes `wrangler.jsonc` and `.env`, generates `BETTER_AUTH_SECRET`, and runs migrations locally and remotely.
- The template's `db:migrate:*` scripts hardcode `takehome-assignment-ts-db`; they're pointed at the `DATABASE` binding so they work whatever the database is named.
- The template ships demo leftovers: recipe tables, three Workflows, an upload route. They're left alone.
- New routers go in `app/trpc/routes/` and are registered in `app/trpc/router.ts`. Pages go under `routes/dashboard/` in `app/routes.ts`.
- Schema change loop: edit `schema.ts` → `bun run db:generate` → `bun run db:migrate:local`, then `db:migrate:remote` before deploying.
- The program catalog is a JSON data file (`app/data/programs.json`) behind a typed loader, not a table: versioned, reviewable, no migration.

## 6. Data model

Four new D1 tables beside Better Auth's `user`; the program catalog is a versioned data file, not a table.

| Table | Key fields | Notes |
| --- | --- | --- |
| `household` | `id`, `name`, `inviteCode` (unique, 6 chars), `createdAt` | |
| `household_member` | `userId` (PK → `user.id`), `householdId`, `role` (`owner` \| `member`) | One household per user |
| `balance` | `id`, `householdId`, `userId`, `programId`, `points` (nullable = unknown), `updatedAt` | Unique on (`householdId`, `userId`, `programId`) |
| `valuation_override` | `householdId`, `programId`, `targetCpp` (real) | PK on both ids |

**Catalog entry** (`app/data/programs.json`): `id`, `name`, `category` (travel \| groceries \| beauty \| food \| coffee \| retail \| bank), `unit`, `valuation: { cpp, method (benchmark | fixed | estimate), source, sourceUrl, asOf, note }`, `transfersTo: { program, ratio, sourceUrl, asOf }[]`, `recovery: { url, identifier, tip }`, `finder: { questionId, reason }`. Top level: `finderQuestions`, `categories`, `asOf`.

Money is integer cents everywhere. Only `cpp` and `targetCpp` are floats. A net-worth line is `round(points × cpp)` cents; totals are sums of rounded lines.

### Seed data

The catalog and the demo fixtures are separate files. Valuations change, so they're data with provenance, never constants buried in logic.

- **`app/data/programs.ts`:** the typed loader for `app/data/programs.json`, validated by a zod schema at load time. Each valuation carries `cpp`, `sourceUrl` and `asOf`, so the UI can show where a number came from and an update is a one-line diff.
- **`app/data/demo-fixtures.json`:** the artificial household (2 users, round-number balances), kept apart from the catalog, with an `expected` block (net worth per member, the Edmonton scenario's ranking) that tests assert against.
- **`scripts/seed-demo.ts`:** idempotent (upserts on the unique keys, safe to run twice). It creates demo users through Better Auth's sign-up API, not raw inserts, so passwords hash the same way real sign-ups do.
- **Tests:** every catalog entry passes the schema; every transfer target exists in the catalog; every entry has an `https` recovery URL; the fixture's net worth matches `expected.netWorthCents`.
