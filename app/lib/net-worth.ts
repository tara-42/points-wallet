import { formatDollars } from "./calculator";

// Pure net-worth math (docs/SPEC.md §3, §6). No I/O: valuations and overrides are injected.
// Each line is round(points × ¢/pt) cents; totals are sums of rounded lines.
// A line uses the household's target for its program when one exists, else the catalog value.

export type Valuation = { cpp: number; source: string; sourceUrl: string; asOf: string };

export type NetWorthInput = {
  balances: { id?: string; userId: string; programId: string; points: number | null }[];
  valuations: Record<string, Valuation>;
  overrides: Partial<Record<string, number>>;
};

export type NetWorthLine = {
  id?: string;
  userId: string;
  programId: string;
  points: number | null;
  cpp: number | null; // the ¢/pt actually used
  cppSource: "override" | "catalog" | null;
  catalog: Valuation | null;
  cents: number | null; // null = excluded from totals (unknown balance or no valuation)
  math: string | null; // "60,000 × 3.0¢ = $1,800.00"
  basis: string; // where the ¢/pt came from
};

export type NetWorthResult = {
  lines: NetWorthLine[];
  totalCents: number;
  byUser: Record<string, number>;
  unknownCount: number; // balances listed but excluded because points are unknown
  unvaluedCount: number; // balances excluded because the program has no valuation
};

/** 2.0 → "2.0", 2.2 → "2.2", 3.33 → "3.33", 25 → "25.0" */
export function formatCpp(cpp: number): string {
  const fixed = cpp.toFixed(2);
  return fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
}

export function computeNetWorth(input: NetWorthInput): NetWorthResult {
  const byUser: Record<string, number> = {};
  let totalCents = 0;
  let unknownCount = 0;
  let unvaluedCount = 0;

  const lines = input.balances.map((b): NetWorthLine => {
    byUser[b.userId] ??= 0;
    const catalog = input.valuations[b.programId] ?? null;
    const override = input.overrides[b.programId];
    const cpp = override ?? catalog?.cpp ?? null;
    const cppSource = override !== undefined ? "override" : catalog ? "catalog" : null;

    const catalogBasis = catalog ? `${catalog.source}, ${catalog.asOf}` : "no valuation";
    const basis =
      cppSource === "override"
        ? `your target ${formatCpp(override!)}¢` +
          (catalog ? ` (catalog ${formatCpp(catalog.cpp)}¢, ${catalogBasis})` : "")
        : catalogBasis;

    let cents: number | null = null;
    let math: string | null = null;
    if (b.points === null) {
      unknownCount++;
    } else if (cpp === null) {
      unvaluedCount++;
    } else {
      cents = Math.round(b.points * cpp);
      math = `${b.points.toLocaleString("en-US")} × ${formatCpp(cpp)}¢ = ${formatDollars(cents)}`;
      totalCents += cents;
      byUser[b.userId] += cents;
    }

    return { id: b.id, userId: b.userId, programId: b.programId, points: b.points, cpp, cppSource, catalog, cents, math, basis };
  });

  return { lines, totalCents, byUser, unknownCount, unvaluedCount };
}
