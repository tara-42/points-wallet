import { z } from "zod";

// Pure redemption calculator (docs/SPEC.md §2). No I/O: the catalog is injected by the caller.

export type ProgramId = string;

const programId = z.string().min(1);

export const pointsOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  program: programId,
  points: z.number().int().positive(),
  feesCents: z.number().int().nonnegative(),
  source: z.object({ program: programId, ratio: z.number().positive() }).optional(),
  ownerUserId: z.string().min(1).optional(),
});

export const calcInputSchema = z.object({
  cashPriceCents: z.number().int().positive(),
  options: z.array(pointsOptionSchema),
  targetCpp: z.record(programId, z.number().positive()),
  catalog: z.record(
    programId,
    z.object({ shortName: z.string().min(1), cpp: z.number().positive().optional() }),
  ),
  balances: z
    .array(
      z.object({
        userId: z.string().min(1),
        program: programId,
        points: z.number().int().nonnegative().nullable(),
      }),
    )
    .optional(),
});

export type PointsOption = z.infer<typeof pointsOptionSchema>;
export type CalcInput = z.infer<typeof calcInputSchema>;

export type Verdict = "USE_POINTS" | "BORDERLINE" | "PAY_CASH" | "UNRATED";
export type TargetSource = "override" | "catalog";

export type EvaluatedOption = {
  id: string;
  label: string;
  program: ProgramId;
  spentProgram: ProgramId;
  sourcePoints: number;
  savedCents: number;
  cpp: number; // unrounded; round to 2 dp only for display
  target: number | null;
  targetSource: TargetSource | null;
  margin: number | null;
  verdict: Verdict;
  reason?: string;
  formula: string;
};

export type RankedOption = EvaluatedOption & { rank: number; balanceUnknown: boolean };

export type OutOfReachOption = EvaluatedOption & {
  shortBy: number;
  householdHoldings: { userId: string; points: number }[];
  coveredByHousehold: boolean;
};

export type CalcResult = {
  ranked: RankedOption[];
  outOfReach: OutOfReachOption[];
  recommendation: { verdict: Verdict; optionId?: string };
};

// Guards against float noise such as 3 / 0.1 = 30.000000000000004, which would ceil to 31.
const RATIO_EPSILON = 1e-9;

const formatDollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function calculate(rawInput: CalcInput): CalcResult {
  const input = calcInputSchema.parse(rawInput);
  const balances = input.balances ?? [];

  const evaluated = input.options.map((option, index) => {
    const spentProgram = option.source?.program ?? option.program;
    const sourcePoints = option.source
      ? Math.ceil(option.points / option.source.ratio - RATIO_EPSILON)
      : option.points;
    const savedCents = input.cashPriceCents - option.feesCents;
    const cpp = savedCents / sourcePoints;

    const override = input.targetCpp[spentProgram];
    const catalogCpp = input.catalog[spentProgram]?.cpp;
    const target = override ?? catalogCpp ?? null;
    const targetSource: TargetSource | null =
      override !== undefined ? "override" : catalogCpp !== undefined ? "catalog" : null;
    const margin = target === null ? null : cpp - target;

    let verdict: Verdict;
    let reason: string | undefined;
    if (savedCents <= 0) {
      verdict = "PAY_CASH";
      reason = "fees exceed cash price";
    } else if (target === null) {
      verdict = "UNRATED";
    } else if (cpp >= target) {
      verdict = "USE_POINTS";
    } else if (cpp >= 0.9 * target) {
      verdict = "BORDERLINE";
    } else {
      verdict = "PAY_CASH";
    }

    const shortName = input.catalog[spentProgram]?.shortName ?? spentProgram;
    const formula =
      `(${formatDollars(input.cashPriceCents)} − ${formatDollars(option.feesCents)}) ÷ ` +
      `${sourcePoints.toLocaleString("en-US")} ${shortName} = ${cpp.toFixed(2)}¢/pt`;

    const result: EvaluatedOption = {
      id: option.id,
      label: option.label,
      program: option.program,
      spentProgram,
      sourcePoints,
      savedCents,
      cpp,
      target,
      targetSource,
      margin,
      verdict,
      ...(reason ? { reason } : {}),
      formula,
    };
    return { result, index, ownerUserId: option.ownerUserId };
  });

  // cpp desc, then margin desc (no target sorts after any margin), then sourcePoints asc, then input order.
  const sorted = [...evaluated].sort((a, b) => {
    if (a.result.cpp !== b.result.cpp) return b.result.cpp - a.result.cpp;
    const ma = a.result.margin ?? -Infinity;
    const mb = b.result.margin ?? -Infinity;
    if (ma !== mb) return mb > ma ? 1 : -1;
    if (a.result.sourcePoints !== b.result.sourcePoints) {
      return a.result.sourcePoints - b.result.sourcePoints;
    }
    return a.index - b.index;
  });

  const ranked: RankedOption[] = [];
  const outOfReach: OutOfReachOption[] = [];

  for (const { result, ownerUserId } of sorted) {
    const ownerPoints =
      ownerUserId === undefined
        ? null
        : (balances.find((b) => b.userId === ownerUserId && b.program === result.spentProgram)
            ?.points ?? null);

    if (ownerPoints === null) {
      ranked.push({ ...result, rank: ranked.length + 1, balanceUnknown: true });
    } else if (ownerPoints >= result.sourcePoints) {
      ranked.push({ ...result, rank: ranked.length + 1, balanceUnknown: false });
    } else {
      const householdHoldings = balances
        .filter(
          (b): b is { userId: string; program: string; points: number } =>
            b.userId !== ownerUserId &&
            b.program === result.spentProgram &&
            b.points !== null &&
            b.points > 0,
        )
        .map((b) => ({ userId: b.userId, points: b.points }));
      const householdTotal = householdHoldings.reduce((sum, h) => sum + h.points, ownerPoints);
      outOfReach.push({
        ...result,
        shortBy: result.sourcePoints - ownerPoints,
        householdHoldings,
        coveredByHousehold: householdTotal >= result.sourcePoints,
      });
    }
  }

  const top = ranked[0];
  const recommendation = top ? { verdict: top.verdict, optionId: top.id } : { verdict: "PAY_CASH" as const };

  return { ranked, outOfReach, recommendation };
}
