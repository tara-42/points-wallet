# Points Wallet

One wallet for a Canadian household's loyalty points: what they're all worth in CAD, whether a redemption is actually good, and which programs you've forgotten you're in.

**Live:** https://points-wallet.tarahkazemi.workers.dev
**Demo login:** `avery@demo.pointswallet.test` / `points-wallet-demo` (Jordan is in the same household: `jordan@demo.pointswallet.test`)

## Why I built this

<!-- Tara: 2–3 sentences in your own voice. Who is this for, and what's the moment it helps? -->

## What works

<!-- Fill in at the end of the build. One line per feature, with where to click. -->

- [ ] Sign up, log in
- [ ] Create a household, invite a partner with a code
- [ ] Wallet: balances per member, net worth in CAD with the math on every line, category filter
- [ ] Redemption calculator: ranked options by ¢/pt, verdicts, out-of-reach options with household cover
- [ ] Forgotten-points finder: questionnaire → programs with recovery links → add to wallet

## What's incomplete

<!-- Fill in at the end of the build. -->

## Deliberately cut

See [Scope → Cut, on purpose](docs/SPEC.md#4-scope) in the spec. Short version: gift cards, email invites, program APIs and screenshot import, promo forecasting, transfer bonuses, live valuation feeds, and "spend $X to close the gap."

## How the numbers work

Redemption value follows [The Points Guy's formula](https://thepointsguy.com/loyalty-programs/calculate-redemption-values): (cash price − taxes and fees) ÷ points used. When points are transferred, "points used" means the points that leave your account. Default valuations come from [Prince of Travel's Canadian benchmarks](https://princeoftravel.com/guides/quarterly-valuation-updates/) and each program's own redemption pages; every value in `app/data/programs.json` carries its source and date. Households can override any target.

## Run it locally

Requires [bun](https://bun.sh) and a Cloudflare account (free tier, with R2 enabled).

```bash
bun install
bunx wrangler login
bun run setup          # creates the D1 database and R2 bucket, writes .env and wrangler.jsonc
bun run dev            # http://localhost:5173 (press l if prompted about remote mode)
bunx vitest run        # tests
```

## How it was built

Built in a 2-hour timebox with Claude Code. The spec (`docs/SPEC.md`), seed data and agent instructions (`CLAUDE.md`) were prepared before the clock started, which the recruiter okayed. Commit 1 is Casper's template, unmodified; commit 2 is that prep; everything after is the timed build, one task per commit, each with a verification the agent ran before the diff was reviewed.

**Stack:** React Router 7 · tRPC · Better Auth · Drizzle + D1 · Cloudflare Workers · Tailwind + shadcn · Vitest
