import { useState, type FormEvent } from "react";
import { api } from "@/trpc/client";
import { catalog, getProgram } from "@/data/programs";
import { formatDollars } from "@/lib/calculator";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function meta() {
  return [{ title: "Wallet · Points Wallet" }];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function WalletPage() {
  const me = api.household.me.useQuery();

  return (
    <div className="p-4 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Points Wallet</h1>
        <LogoutButton />
      </div>
      {me.isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : me.error ? (
        <p className="text-destructive">{me.error.message}</p>
      ) : me.data ? (
        <Wallet />
      ) : (
        <Onboarding />
      )}
    </div>
  );
}

function Onboarding() {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const onDone = () => utils.household.me.invalidate();
  const create = api.household.create.useMutation({ onSuccess: onDone });
  const join = api.household.join.useMutation({ onSuccess: onDone });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Create a household</CardTitle>
          <CardDescription>You'll get a 6-character code to share.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate({ name });
            }}
          >
            <Label htmlFor="household-name">Household name</Label>
            <Input id="household-name" value={name} onChange={(e) => setName(e.target.value)} />
            {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
            <Button type="submit" disabled={create.isPending}>Create</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Join a household</CardTitle>
          <CardDescription>Enter the invite code a member shared with you.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              join.mutate({ inviteCode: code });
            }}
          >
            <Label htmlFor="invite-code">Invite code</Label>
            <Input id="invite-code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} />
            {join.error && <p className="text-sm text-destructive">{join.error.message}</p>}
            <Button type="submit" disabled={join.isPending}>Join</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Wallet() {
  const wallet = api.wallet.get.useQuery();
  const utils = api.useUtils();
  const [filter, setFilter] = useState("all");
  const [programId, setProgramId] = useState("");
  const [points, setPoints] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => utils.wallet.get.invalidate();
  const upsert = api.wallet.upsertBalance.useMutation({
    onSuccess: () => {
      setProgramId("");
      setPoints("");
      setUnknown(false);
      return refresh();
    },
  });
  const remove = api.wallet.deleteBalance.useMutation({ onSuccess: refresh });

  if (wallet.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (wallet.error || !wallet.data) return <p className="text-destructive">{wallet.error?.message}</p>;

  const { household, members, netWorth, me } = wallet.data;
  const memberName = new Map(members.map((m) => [m.userId, m.name]));
  const lines = netWorth.lines.filter(
    (l) => filter === "all" || getProgram(l.programId)?.category === filter
  );
  const filteredCents = lines.reduce((sum, l) => sum + (l.cents ?? 0), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!programId) return setFormError("Choose a program");
    let value: number | null = null;
    if (!unknown) {
      value = Number(points.replace(/[,\s]/g, ""));
      if (points.trim() === "" || !Number.isInteger(value) || value < 0) {
        return setFormError("Points must be a whole number, or tick Unknown");
      }
    }
    upsert.mutate({ programId, points: value });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{household.name}</CardTitle>
          <CardDescription>
            Invite code <span className="font-mono font-medium">{household.inviteCode}</span> ·{" "}
            {members.map((m) => `${m.name} (${m.role})`).join(", ")}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Net worth (CAD)</CardDescription>
          <CardTitle className="text-3xl">{formatDollars(netWorth.totalCents)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {members.map((m) => (
            <div key={m.userId} className="flex justify-between max-w-xs">
              <span>{m.name}</span>
              <span>{formatDollars(netWorth.byUser[m.userId] ?? 0)}</span>
            </div>
          ))}
          {netWorth.unknownCount > 0 && (
            <p className="text-muted-foreground pt-2">
              Excludes {plural(netWorth.unknownCount, "program")} with an unknown balance.
            </p>
          )}
          {netWorth.unvaluedCount > 0 && (
            <p className="text-muted-foreground">
              Excludes {plural(netWorth.unvaluedCount, "program")} with no valuation.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add or update a balance</CardTitle>
          <CardDescription>You can edit your own balances. Saving a program you already have replaces it.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
            <div className="space-y-1">
              <Label>Program</Label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Choose a program" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="points">Points</Label>
              <Input
                id="points"
                className="w-36"
                inputMode="numeric"
                value={points}
                disabled={unknown}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox id="unknown" checked={unknown} onCheckedChange={(v) => setUnknown(v === true)} />
              <Label htmlFor="unknown">Unknown</Label>
            </div>
            <Button type="submit" disabled={upsert.isPending}>Save</Button>
          </form>
          {(formError || upsert.error) && (
            <p className="text-sm text-destructive pt-2">{formError ?? upsert.error?.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => setFilter(v || "all")}
          className="flex-wrap"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {catalog.categories.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {capitalize(c)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {filter !== "all" && (
          <p className="text-sm text-muted-foreground">
            {capitalize(filter)}: {formatDollars(filteredCents)}
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead>Member</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Valuation</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {netWorth.lines.length === 0 ? "No balances yet. Add one above." : "No balances in this category."}
                </TableCell>
              </TableRow>
            ) : (
              lines.map((l) => {
                const program = getProgram(l.programId);
                const mine = l.userId === me;
                return (
                  <TableRow key={l.id ?? `${l.userId}-${l.programId}`}>
                    <TableCell>
                      <div>{program?.name ?? l.programId}</div>
                      {program && <Badge variant="secondary">{capitalize(program.category)}</Badge>}
                    </TableCell>
                    <TableCell>{memberName.get(l.userId) ?? "Former member"}</TableCell>
                    <TableCell className="text-right">
                      {l.points === null ? "Unknown" : l.points.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.math ?? <span className="text-muted-foreground">excluded from total</span>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-normal">
                      {l.catalog ? (
                        <a href={l.catalog.sourceUrl} target="_blank" rel="noreferrer" className="underline">
                          {l.basis}
                        </a>
                      ) : (
                        l.basis
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {mine && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setProgramId(l.programId);
                              setUnknown(l.points === null);
                              setPoints(l.points === null ? "" : String(l.points));
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate({ programId: l.programId })}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
