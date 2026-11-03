# Points Wallet

A household loyalty-points wallet for Canadians: combined net worth in CAD, a redemption calculator, and a forgotten-points finder. Built on Casper's template: React Router 7, tRPC v11, Better Auth, Drizzle + D1, Cloudflare Workers, bun.

The spec is the contract. Build against it; don't build what it cuts.

@docs/SPEC.md

## How we work

- One task at a time. Before writing code, read the files you'll touch and propose a plan of at most 5 bullets. Wait for approval.
- Every task has a verification. Run it and show the output; a task is not done until it passes.
- Run `bun run typecheck` before proposing a commit. Keep each diff small and on-task.
- If the spec is ambiguous, wrong, or in the way, stop and ask. Don't guess. If a decision changes, update `docs/SPEC.md` in the same commit.
- When something fails, diagnose and show the error before changing files.

## Rules

- `app/lib/calculator.ts` is a pure function: no I/O, no imports from `app/db`, `app/trpc` or React.
- Valuations, transfer ratios and recovery URLs come from `app/data/programs.json`. Never hard-code them in logic or components.
- Money is integer cents. Only cpp values are floats. Round each net-worth line to the nearest cent, then sum.
- Use `protectedProcedure` for anything that reads or writes household data, and scope every query to the caller's household.
- Validate all tRPC inputs with zod.
- Leave the template's demo code alone (recipe tables, workflows, upload route). Don't refactor what the task doesn't need.
- Never edit an applied migration; generate a new one.
- Never commit secrets (`.env`, `.dev.vars`).

## Layout

- tRPC routers: `app/trpc/routes/`, registered in `app/trpc/router.ts`
- Pages: `app/routes/dashboard/`, registered in `app/routes.ts`
- Schema: `app/db/schema.ts`; migrations: `drizzle/`
- UI components: `app/components/ui/` (shadcn)
- Seed data: `app/data/programs.json`, `app/data/demo-fixtures.json`

## Commands

```bash
bun run dev                 # local dev at http://localhost:5173 (press l if asked about remote mode)
bun run typecheck
bunx vitest run             # tests (not `bun test`)
bun run db:generate         # after editing schema.ts
bun run db:migrate:local
bun run db:migrate:remote   # before every deploy that changes the schema
bun run deploy
bunx wrangler tail          # production logs
```
