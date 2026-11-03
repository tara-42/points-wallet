import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { api } from "@/trpc/client";
import type { AppRouter } from "@/trpc/router";
import { catalog, getProgram, transferSources } from "@/data/programs";
import fixtures from "@/data/demo-fixtures.json";
import { formatDollars, type Verdict } from "@/lib/calculator";
import { formatCpp } from "@/lib/net-worth";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function meta() {
  return [{ title: "Calculator · Points Wallet" }];
}

type EvaluateInput = inferRouterInputs<AppRouter>["calculator"]["evaluate"];
type EvaluateOutput = inferRouterOutputs<AppRouter>["calculator"]["evaluate"];
type Row = { key: number; label: string; program: string; points: string; fees: string; source: string; owner: string };

const NONE = "__none"; // Radix Select items can't use an empty string
let nextKey = 1;
const emptyRow = (): Row => ({ key: nextKey++, label: "", program: "", points: "", fees: "0", source: NONE, owner: NONE });

/** "$1,234.50" / "1234.5" → 123450 cents, or null if not a valid amount. */
function parseDollars(s: string): number | null {
  const clean = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
function parsePoints(s: string): number | null {
  const clean = s.replace(/[,\s]/g, "");
  return /^\d+$/.test(clean) ? Number(clean) : null;
}

const verdictBadge: Record<Verdict, string> = {
  USE_POINTS: "border-transparent bg-green-600 text-white dark:bg-green-500 dark:text-green-950",
  BORDERLINE: "border-transparent bg-amber-400 text-amber-950 dark:bg-amber-400 dark:text-amber-950",
  PAY_CASH: "border-transparent bg-red-600 text-white dark:bg-red-500 dark:text-red-950",
  UNRATED: "border-transparent bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
};
const verdictCard: Record<Verdict, string> = {
  USE_POINTS: "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
  BORDERLINE: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  PAY_CASH: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
  UNRATED: "border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40",
};
const coveredBadge = "border-transparent bg-green-600 text-white dark:bg-green-500 dark:text-green-950";
const verdictLabel: Record<Verdict, string> = {
  USE_POINTS: "Use points",
  BORDERLINE: "Borderline",
  PAY_CASH: "Pay cash",
  UNRATED: "Unrated",
};
const shortName = (id: string) => getProgram(id)?.shortName ?? id;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;

export default function CalculatorPage() {
  const me = api.household.me.useQuery();

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Redemption calculator</h1>
          <Link to="/dashboard/wallet" className="text-sm underline">Wallet</Link>
          <Link to="/dashboard/finder" className="text-sm underline">Finder</Link>
        </div>
        <LogoutButton />
      </div>
      {me.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : me.data ? (
        <Calculator members={me.data.members} />
      ) : (
        <p>
          You need a household first. <Link to="/dashboard/wallet" className="underline">Create or join one</Link>.
        </p>
      )}
    </div>
  );
}

function Calculator({ members }: { members: { userId: string; name: string }[] }) {
  const [cash, setCash] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<EvaluateInput | null>(null);

  const evaluate = api.calculator.evaluate.useQuery(submitted!, { enabled: submitted !== null });

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Changing the award program can invalidate the transfer source.
        if (patch.program !== undefined && !transferSources(next.program).some((s) => s.program.id === next.source)) {
          next.source = NONE;
        }
        return next;
      })
    );

  // Fixture owners are keys ("avery", "jordan"); match them to members by first name.
  // No match (e.g. a household without them) leaves Paid by empty, as in the golden test.
  const memberFor = (key: string | undefined) =>
    members.find((m) => key && m.name.split(" ")[0].toLowerCase() === key.toLowerCase())?.userId ?? NONE;

  const loadExample = () => {
    const s = fixtures.calculatorScenario;
    setCash(String(s.cashPriceCents / 100));
    setRows(
      s.options.map((o) => ({
        key: nextKey++,
        label: o.label,
        program: o.program,
        points: String(o.points),
        fees: String(o.feesCents / 100),
        source: o.source?.program ?? NONE,
        owner: memberFor(o.owner),
      }))
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cashPriceCents = parseDollars(cash);
    if (!cashPriceCents) return setFormError("Enter a cash price above $0");
    const options: EvaluateInput["options"] = [];
    for (const [i, r] of rows.entries()) {
      const n = `Option ${i + 1}`;
      const points = parsePoints(r.points);
      const feesCents = parseDollars(r.fees || "0");
      if (!r.label.trim()) return setFormError(`${n}: add a label`);
      if (!r.program) return setFormError(`${n}: choose the program the award is booked in`);
      if (!points) return setFormError(`${n}: points must be a whole number above 0`);
      if (feesCents === null) return setFormError(`${n}: fees must be a dollar amount`);
      options.push({
        id: String(r.key),
        label: r.label,
        program: r.program,
        points,
        feesCents,
        sourceProgram: r.source === NONE ? undefined : r.source,
        ownerUserId: r.owner === NONE ? undefined : r.owner,
      });
    }
    setSubmitted({ cashPriceCents, options });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Trip</CardTitle>
          <CardDescription>
            ¢/pt = (cash price − fees) ÷ points spent. Transfer ratios come from the catalog.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="cash">Cash price (CAD)</Label>
                <Input id="cash" className="w-36" inputMode="decimal" placeholder="480.00" value={cash} onChange={(e) => setCash(e.target.value)} />
              </div>
              <Button type="button" variant="outline" onClick={loadExample}>
                Load Edmonton example
              </Button>
            </div>

            {rows.map((r, i) => {
              const sources = r.program ? transferSources(r.program) : [];
              return (
                <div key={r.key} className="flex flex-wrap items-end gap-3 border-t pt-3">
                  <div className="space-y-1">
                    <Label>Option {i + 1}</Label>
                    <Input className="w-56" placeholder="Flying Blue via Amex MR" value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Booked in</Label>
                    <Select value={r.program} onValueChange={(v) => update(r.key, { program: v })}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Program" /></SelectTrigger>
                      <SelectContent>
                        {catalog.programs.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.shortName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Award points</Label>
                    <Input className="w-28" inputMode="numeric" value={r.points} onChange={(e) => update(r.key, { points: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fees ($)</Label>
                    <Input className="w-24" inputMode="decimal" value={r.fees} onChange={(e) => update(r.key, { fees: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Transfer from</Label>
                    <Select value={r.source} onValueChange={(v) => update(r.key, { source: v })} disabled={sources.length === 0}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None (direct)</SelectItem>
                        {sources.map((s) => (
                          <SelectItem key={s.program.id} value={s.program.id}>
                            {s.program.shortName} (1:{s.ratio})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Paid by</Label>
                    <Select value={r.owner} onValueChange={(v) => update(r.key, { owner: v })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {members.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                    Remove
                  </Button>
                </div>
              );
            })}

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
                Add option
              </Button>
              <Button type="submit">Calculate</Button>
            </div>
            {(formError || evaluate.error) && (
              <p className="text-sm text-destructive">{formError ?? evaluate.error?.message}</p>
            )}
          </form>
        </CardContent>
      </Card>

      {evaluate.isFetching && <p className="text-muted-foreground">Calculating…</p>}
      {evaluate.data && <Results data={evaluate.data} />}
    </>
  );
}

function Results({ data }: { data: EvaluateOutput }) {
  const { result, members } = data;
  const name = new Map(members.map((m) => [m.userId, m.name]));
  const all = [...result.ranked, ...result.outOfReach];
  const picked = all.find((o) => o.id === result.recommendation.optionId);

  return (
    <>
      <Card className={verdictCard[result.recommendation.verdict]}>
        <CardHeader>
          <CardDescription>Recommendation</CardDescription>
          <CardTitle className="flex items-center gap-3">
            <Badge className={verdictBadge[result.recommendation.verdict]}>
              {verdictLabel[result.recommendation.verdict]}
            </Badge>
            {picked
              ? `${picked.label} at ${picked.cpp.toFixed(2)}¢/pt`
              : result.ranked.length === 0 && result.outOfReach.length > 0
                ? "No option is affordable; pay cash."
                : "No option clears its target; pay cash."}
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Ranked</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Option</TableHead>
              <TableHead>¢/pt</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Margin</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.ranked.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">No affordable options.</TableCell>
              </TableRow>
            ) : (
              result.ranked.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.rank}</TableCell>
                  <TableCell>
                    <div>{r.label}</div>
                    {r.balanceUnknown && <div className="text-xs text-muted-foreground">Balance unknown</div>}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.cpp.toFixed(2)}¢</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.formula}</div>
                  </TableCell>
                  <TableCell>
                    {r.target === null ? (
                      <span className="text-muted-foreground">none</span>
                    ) : (
                      <>
                        <div>{formatCpp(r.target)}¢ {shortName(r.spentProgram)}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.targetSource === "override" ? "your target" : "catalog default"}
                        </div>
                      </>
                    )}
                  </TableCell>
                  <TableCell>{r.margin === null ? "—" : signed(r.margin)}</TableCell>
                  <TableCell>
                    <Badge className={verdictBadge[r.verdict]}>{verdictLabel[r.verdict]}</Badge>
                    {r.reason && <div className="text-xs text-muted-foreground">{r.reason}</div>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {result.outOfReach.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Out of reach</h2>
          <p className="text-sm text-muted-foreground">
            The paying member doesn't have enough points. Household cover is informational: whether
            points can move between members depends on each program's rules.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead>¢/pt</TableHead>
                <TableHead>Short by</TableHead>
                <TableHead>Household holds</TableHead>
                <TableHead>Cover</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.outOfReach.map((o) => (
                <TableRow key={o.id} className="text-muted-foreground">
                  <TableCell>{o.label}</TableCell>
                  <TableCell>
                    <div className="font-medium">{o.cpp.toFixed(2)}¢</div>
                    <div className="font-mono text-xs text-muted-foreground">{o.formula}</div>
                  </TableCell>
                  <TableCell>
                    {o.shortBy.toLocaleString("en-US")} {shortName(o.spentProgram)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.householdHoldings.length === 0
                      ? "No one else holds any"
                      : o.householdHoldings
                          .map((h) => `${name.get(h.userId) ?? "A member"} holds ${h.points.toLocaleString("en-US")} ${shortName(o.spentProgram)}`)
                          .join("; ")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={o.coveredByHousehold ? "default" : "outline"}
                      className={o.coveredByHousehold ? coveredBadge : undefined}
                    >
                      {o.coveredByHousehold ? "Covered by household" : "Not covered"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
