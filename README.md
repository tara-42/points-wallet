# Points Wallet

One wallet for a Canadian household's loyalty points: what they're all worth in CAD, whether a redemption is actually good, and which programs you've forgotten you're in.

**Live:** https://points-wallet.tarahkazemi.workers.dev
**Demo login:** `avery@demo.pointswallet.test` / `points-wallet-demo` (Jordan is in the same household: `jordan@demo.pointswallet.test`)

## Why I built this

I'm a points maximizer. Between my husband and me, we hold points in about 15 programs: Aeroplan, Amex, Porter, Flying Blue and IHG on the travel side, and PC Optimum, Scene+, Sephora, Dynamite and Domino's on the everyday side. Nothing shows me all of it in one place, or what it's worth.

Three moments made me build this:

- **Every trip turns into math.** Booking Vancouver → Edmonton for Christmas meant comparing Flair at $480 cash against 30,000 Aeroplan or 15,000 Flying Blue transferred from Amex, then pasting it all into ChatGPT / doing it in a spreadsheet. The real question isn't how many points we've piled up. It's whether to spend them now, when cash is tight, or save them for a bigger trip where they'll stretch further. That trade-off depends on what each point is worth to you.
- **Points live in a household, not a person.** My husband's Chase points book our flights; my PC Optimum and Sephora points buy my expensive skincare. The wallets I tried were built for one person, priced in USD, and missed Canadian programs like Porter, Scene+ and PC Optimum.
- **We forget programs entirely.** I'd forgotten I had Dynamite points. If I knew I was one order away from a free Domino's pizza, I'd order it (that one's next on the list).

So the product does three things: adds up a household's points in CAD with the math on every line, ranks redemption options by cents per point against your own targets, and asks a few questions to surface programs you've forgotten, with links to recover them.

## What works

- **Sign up, log in:** `/sign-up`, `/login`. After login you land on the wallet.
- **Household:** on your first visit to the wallet, create a household or join one with its 6-character invite code. The code is shown at the top of the wallet. Everyone in the household sees the same wallet.
- **Wallet** (`/dashboard/wallet`): add your balances per program, or mark one "unknown". Net worth in CAD shows the math on every line (`60,000 × 3.0¢ = $1,800.00`) with the valuation's source and date. Unknown balances are listed but left out of the total, and the total says so. Filter by category. You can edit only your own balances.
- **Redemption calculator** (`/dashboard/calculator`): enter a cash price and one or more points options. "Load Edmonton example" fills in the spec's scenario. Options are ranked by ¢/pt with the formula under each one. Each gets a verdict against your target (use points / borderline / pay cash), with the target's source ("your target" or "catalog default"). Options the paying member can't afford move to "Out of reach", with points short and what the rest of the household holds. The recommendation is the best option that clears its target.
- **Forgotten-points finder** (`/dashboard/finder`): five yes/no questions. Each matching program shows why it matched, the account identifier to try and an `https` recovery link. "Add to wallet" adds it as an unknown balance and never overwrites one you already have.
- **Demo data:** `bun scripts/seed-demo.ts --remote` (or `--local`) creates the demo household from `app/data/demo-fixtures.json`. It's safe to run again, and resets the demo to the fixture.
- **Tests:** `bunx vitest run` runs 38 unit tests. They cover the calculator (the golden Edmonton case ranks B, A, C, plus edge cases), net worth against the fixture's expected $3,962.49, catalog integrity (schema, transfer targets, `https` recovery URLs, finder questions), the demo scenario and the finder.

## What's incomplete

- **Editing household targets.** Targets are stored and applied in both net worth and the calculator, but there's no screen to edit them yet. The demo household's Aeroplan 3.0¢ target was seeded and shows read-only with its source.
- **The calculator is travel-only.** "Booked in" lists airline and hotel programs.
- **Nice-to-haves not built:** saved calculator scenarios, prefilling options from your balances, and the "one order away from a free pizza" progress.
- **Household management:** you can't leave a household, remove a member or regenerate an invite code.
- **Tests stop at unit level.** The API and pages were checked with scripts during the build; those checks aren't in the repo as integration tests.
- **`bun run typecheck` reports errors.** All of them are in the template's demo code (`workflows/`, `app/models/recipe.ts`), and they're identical on the untouched template commit. The bar for this build is no new errors; `CLAUDE.md` has the check.

## Deliberately cut

See [Scope → Cut, on purpose](docs/SPEC.md#4-scope) in the spec. Short version: gift cards, email invites, program APIs and screenshot import, promo forecasting, transfer bonuses, live valuation feeds, and "spend $X to close the gap."

## How the numbers work

Redemption value follows [The Points Guy's formula](https://thepointsguy.com/loyalty-programs/calculate-redemption-values): (cash price − taxes and fees) ÷ points used. When points are transferred, "points used" means the points that leave your account. Default valuations come from [Prince of Travel's Canadian benchmarks](https://princeoftravel.com/guides/quarterly-valuation-updates/) and each program's own redemption pages; every value in `app/data/programs.json` carries its source and date. A household's own target for a program, when set, replaces the catalog value in both the verdict and net worth, and the catalog value stays visible beside it.

## Run it locally

Requires [bun](https://bun.sh) and a Cloudflare account (free tier, with R2 enabled).

```bash
bun install
bunx wrangler login
bun run setup          # creates the D1 database and R2 bucket, writes .env and wrangler.jsonc
bun run dev            # migrates locally, serves http://localhost:5173 (press l if prompted about remote mode)
bunx vitest run        # tests
bun scripts/seed-demo.ts --local   # demo household (with the dev server running)
```

Deploy:

```bash
bun run db:migrate:remote && bun run deploy
bun scripts/seed-demo.ts --remote
```

## How it was built

Built in a 2-hour timebox with Claude Code. The spec (`docs/SPEC.md`), seed data and agent instructions (`CLAUDE.md`) were prepared before the clock started. Commit 1 is Casper's template, unmodified; commit 2 is that prep; everything after is the timed build, one task per commit, each with a verification the agent ran before the diff was reviewed.

**Stack:** React Router 7 · tRPC · Better Auth · Drizzle + D1 · Cloudflare Workers · Tailwind + shadcn · Vitest
