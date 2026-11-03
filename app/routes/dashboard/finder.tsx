import { useState } from "react";
import { Link } from "react-router";
import { api } from "@/trpc/client";
import { catalog } from "@/data/programs";
import { findPrograms } from "@/lib/finder";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function meta() {
  return [{ title: "Finder · Points Wallet" }];
}

const inWalletBadge = "border-transparent bg-green-600 text-white dark:bg-green-500 dark:text-green-950";

export default function FinderPage() {
  const me = api.household.me.useQuery();
  const hasHousehold = !!me.data;
  const wallet = api.wallet.get.useQuery(undefined, { enabled: hasHousehold });
  const utils = api.useUtils();
  const add = api.wallet.addUnknown.useMutation({ onSuccess: () => utils.wallet.get.invalidate() });
  const [answers, setAnswers] = useState<string[]>([]);

  const results = findPrograms({ questions: catalog.finderQuestions, programs: catalog.programs, answers });
  const mine = new Set(
    (wallet.data?.balances ?? []).filter((b) => b.userId === wallet.data?.me).map((b) => b.programId)
  );
  const toggle = (id: string, on: boolean) =>
    setAnswers((a) => (on ? [...a, id] : a.filter((x) => x !== id)));

  return (
    <div className="p-4 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Forgotten-points finder</h1>
          <Link to="/dashboard/wallet" className="text-sm underline">Wallet</Link>
          <Link to="/dashboard/calculator" className="text-sm underline">Calculator</Link>
        </div>
        <LogoutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Which of these apply to you?</CardTitle>
          <CardDescription>Tick any that apply. Matching programs appear below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {catalog.finderQuestions.map((q) => (
            <div key={q.id} className="flex items-center gap-2">
              <Checkbox
                id={`q-${q.id}`}
                checked={answers.includes(q.id)}
                onCheckedChange={(v) => toggle(q.id, v === true)}
              />
              <Label htmlFor={`q-${q.id}`}>{q.text}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      {!me.isLoading && !hasHousehold && (
        <p className="text-sm">
          <Link to="/dashboard/wallet" className="underline">Create or join a household</Link> to add these to your wallet.
        </p>
      )}
      {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}

      {answers.length > 0 && results.length === 0 && (
        <p className="text-muted-foreground">No programs match those answers.</p>
      )}
      <div className="space-y-3">
        {results.map((r) => (
          <Card key={r.programId}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span>{r.name}</span>
                {mine.has(r.programId) ? (
                  <Badge className={inWalletBadge}>In your wallet</Badge>
                ) : (
                  <Button
                    size="sm"
                    disabled={!hasHousehold || !wallet.data || add.isPending}
                    onClick={() => add.mutate({ programId: r.programId })}
                  >
                    Add to wallet
                  </Button>
                )}
              </CardTitle>
              <CardDescription>
                {r.reason} (you said yes to "{r.question.text}")
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Try: </span>
                {r.identifier}
              </div>
              <div>
                <a href={r.url} target="_blank" rel="noreferrer" className="underline break-all">
                  {r.url}
                </a>
              </div>
              <div className="text-muted-foreground">{r.tip}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
