/**
 * Seed the demo household from app/data/demo-fixtures.json (docs/SPEC.md §6).
 *
 *   bun scripts/seed-demo.ts --local                 # http://localhost:5173 + local D1 (dev server must be running)
 *   bun scripts/seed-demo.ts --remote                # deployed Worker + remote D1
 *   bun scripts/seed-demo.ts --remote --base <url>   # override the app URL
 *
 * Idempotent: users are created through Better Auth's sign-up API (or signed in if they exist),
 * so passwords hash exactly like real sign-ups. Everything else is upserted on its unique keys.
 * Balances in the demo household that aren't in the fixture are removed, so a rerun resets the demo.
 */
import { execFileSync } from "node:child_process";
import fixtures from "../app/data/demo-fixtures.json";

const args = process.argv.slice(2);
const target = args.includes("--remote") ? "remote" : args.includes("--local") ? "local" : null;
if (!target) {
  console.error("Usage: bun scripts/seed-demo.ts --local | --remote [--base <url>]");
  process.exit(1);
}
const baseFlag = args.indexOf("--base");
const BASE =
  baseFlag >= 0
    ? args[baseFlag + 1]
    : target === "remote"
      ? "https://points-wallet.tarahkazemi.workers.dev"
      : "http://localhost:5173";

const HOUSEHOLD_ID = "demo-maple-street";

async function authRequest(endpoint: "sign-up/email" | "sign-in/email", body: Record<string, string>) {
  const res = await fetch(`${BASE}/api/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { user?: { id: string }; code?: string; message?: string } | null;
  return { status: res.status, json };
}

async function ensureUser(u: (typeof fixtures.users)[number]): Promise<string> {
  const password = fixtures.demoPassword;
  const up = await authRequest("sign-up/email", { name: u.name, email: u.email, password });
  if (up.json?.user?.id) {
    console.log(`  created ${u.email}`);
    return up.json.user.id;
  }
  const inn = await authRequest("sign-in/email", { email: u.email, password });
  if (inn.json?.user?.id) {
    console.log(`  exists  ${u.email}`);
    return inn.json.user.id;
  }
  throw new Error(
    `Could not create or sign in ${u.email}: sign-up ${up.status} ${up.json?.message ?? ""}; sign-in ${inn.status} ${inn.json?.message ?? ""}`
  );
}

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const num = (n: number | null) => (n === null ? "NULL" : String(Math.trunc(n)));

async function main() {
  console.log(`Seeding demo household (${target}) via ${BASE}`);
  const ids: Record<string, string> = {};
  for (const u of fixtures.users) ids[u.key] = await ensureUser(u);

  const now = Date.now();
  const sql: string[] = [
    `INSERT INTO household (id, name, invite_code, created_at) VALUES (${q(HOUSEHOLD_ID)}, ${q(fixtures.household.name)}, ${q(fixtures.household.inviteCode)}, ${now})
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, invite_code = excluded.invite_code;`,
    ...fixtures.users.map(
      (u) => `INSERT INTO household_member (user_id, household_id, role) VALUES (${q(ids[u.key])}, ${q(HOUSEHOLD_ID)}, ${q(u.role)})
       ON CONFLICT(user_id) DO UPDATE SET household_id = excluded.household_id, role = excluded.role;`
    ),
    ...fixtures.balances.map(
      (b) => `INSERT INTO balance (id, household_id, user_id, program_id, points, updated_at)
       VALUES (${q(`demo-${b.user}-${b.program}`)}, ${q(HOUSEHOLD_ID)}, ${q(ids[b.user])}, ${q(b.program)}, ${num(b.points)}, ${now})
       ON CONFLICT(household_id, user_id, program_id) DO UPDATE SET points = excluded.points, updated_at = excluded.updated_at;`
    ),
    `DELETE FROM balance WHERE household_id = ${q(HOUSEHOLD_ID)} AND (user_id || '/' || program_id) NOT IN (${fixtures.balances
      .map((b) => q(`${ids[b.user]}/${b.program}`))
      .join(", ")});`,
    ...fixtures.valuationOverrides.map(
      (o) => `INSERT INTO valuation_override (household_id, program_id, target_cpp) VALUES (${q(HOUSEHOLD_ID)}, ${q(o.program)}, ${o.targetCpp})
       ON CONFLICT(household_id, program_id) DO UPDATE SET target_cpp = excluded.target_cpp;`
    ),
    `DELETE FROM valuation_override WHERE household_id = ${q(HOUSEHOLD_ID)} AND program_id NOT IN (${fixtures.valuationOverrides
      .map((o) => q(o.program))
      .join(", ")});`,
  ];

  // Inline --command, not --file: wrangler's --file reader intermittently fails with
  // "A FileHandle object was closed during garbage collection".
  execFileSync("bunx", ["wrangler", "d1", "execute", "DATABASE", `--${target}`, "--yes", "--command", sql.join("\n")], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  console.log(
    `Done: household ${fixtures.household.name} (code ${fixtures.household.inviteCode}), ${fixtures.users.length} users, ` +
      `${fixtures.balances.length} balances, ${fixtures.valuationOverrides.length} override(s).`
  );
  console.log(`Log in at ${BASE}/login as ${fixtures.users[0].email} / ${fixtures.demoPassword}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
