import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { calculate, type CalcInput, type PointsOption } from "./calculator";

// Values copied from docs/SPEC.md (real as of 2026-11-03) so this test never changes with the catalog.
const catalog: CalcInput["catalog"] = {
  aeroplan: { shortName: "Aeroplan", cpp: 2.0 },
  amex_mr_ca: { shortName: "Amex MR", cpp: 2.2 },
  flying_blue: { shortName: "Flying Blue" },
};

const A: PointsOption = {
  id: "A",
  label: "Aeroplan from Aeroplan balance",
  program: "aeroplan",
  points: 30_000,
  feesCents: 9_000,
};
const B: PointsOption = {
  id: "B",
  label: "Flying Blue via Amex MR",
  program: "flying_blue",
  points: 15_000,
  feesCents: 12_000,
  source: { program: "amex_mr_ca", ratio: 1 },
};
const C: PointsOption = {
  id: "C",
  label: "Aeroplan via Amex MR",
  program: "aeroplan",
  points: 30_000,
  feesCents: 9_000,
  source: { program: "amex_mr_ca", ratio: 1 },
};

const edmonton = (overrides: Partial<CalcInput> = {}): CalcInput => ({
  cashPriceCents: 48_000,
  options: [A, B, C],
  targetCpp: {},
  catalog,
  ...overrides,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("golden: Edmonton for Christmas", () => {
  const result = calculate(edmonton());

  it("ranks B, A, C", () => {
    expect(ids(result.ranked)).toEqual(["B", "A", "C"]);
    expect(result.ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(result.outOfReach).toEqual([]);
  });

  it("computes cpp, spent points and verdicts", () => {
    const [b, a, c] = result.ranked;
    expect(b.cpp).toBeCloseTo(2.4, 10);
    expect(a.cpp).toBeCloseTo(1.3, 10);
    expect(c.cpp).toBeCloseTo(1.3, 10);
    expect([b.sourcePoints, a.sourcePoints, c.sourcePoints]).toEqual([15_000, 30_000, 30_000]);
    expect([b.spentProgram, a.spentProgram, c.spentProgram]).toEqual([
      "amex_mr_ca",
      "aeroplan",
      "amex_mr_ca",
    ]);
    expect([b.verdict, a.verdict, c.verdict]).toEqual(["USE_POINTS", "PAY_CASH", "PAY_CASH"]);
    expect([b.target, a.target, c.target]).toEqual([2.2, 2.0, 2.2]);
    expect(result.ranked.every((r) => r.targetSource === "catalog")).toBe(true);
  });

  it("breaks the A/C tie on margin", () => {
    const [, a, c] = result.ranked;
    expect(a.cpp).toBe(c.cpp);
    expect(a.margin).toBeCloseTo(-0.7, 10);
    expect(c.margin).toBeCloseTo(-0.9, 10);
  });

  it("renders formula strings", () => {
    const [b, a, c] = result.ranked;
    expect(b.formula).toBe("($480.00 − $120.00) ÷ 15,000 Amex MR = 2.40¢/pt");
    expect(a.formula).toBe("($480.00 − $90.00) ÷ 30,000 Aeroplan = 1.30¢/pt");
    expect(c.formula).toBe("($480.00 − $90.00) ÷ 30,000 Amex MR = 1.30¢/pt");
  });

  it("recommends the top-ranked option", () => {
    expect(result.recommendation).toEqual({ verdict: "USE_POINTS", optionId: "B" });
  });
});

describe("targets and verdict thresholds", () => {
  it("prefers a household override and labels its source", () => {
    const { ranked } = calculate(edmonton({ targetCpp: { aeroplan: 3.0 } }));
    const a = ranked.find((r) => r.id === "A")!;
    expect(a.target).toBe(3.0);
    expect(a.targetSource).toBe("override");
    // A's margin is now -1.70, below C's -0.90, so C wins the tie.
    expect(ids(ranked)).toEqual(["B", "C", "A"]);
  });

  it("is BORDERLINE between 90% and 100% of target", () => {
    // (48,000 − 8,000) / 20,000 = 2.00¢ vs Amex MR 2.2¢ (floor 1.98¢)
    const option = { ...B, id: "X", points: 20_000, feesCents: 8_000 };
    const { ranked } = calculate(edmonton({ options: [option] }));
    expect(ranked[0].verdict).toBe("BORDERLINE");
  });
});

describe("edge cases", () => {
  it("1: fees >= cash price is PAY_CASH with reason, ranked last", () => {
    const over = { ...A, id: "OVER", feesCents: 50_000 };
    const equal = { ...A, id: "EQUAL", feesCents: 48_000 };
    const { ranked } = calculate(edmonton({ options: [over, A, equal] }));
    expect(ids(ranked)).toEqual(["A", "EQUAL", "OVER"]);
    for (const row of ranked.slice(1)) {
      expect(row.cpp).toBeLessThanOrEqual(0);
      expect(row.verdict).toBe("PAY_CASH");
      expect(row.reason).toBe("fees exceed cash price");
    }
  });

  it("2: non-positive points, ratio or cash price is a zod error", () => {
    expect(() => calculate(edmonton({ options: [{ ...A, points: 0 }] }))).toThrow(ZodError);
    expect(() => calculate(edmonton({ options: [{ ...A, points: -5 }] }))).toThrow(ZodError);
    expect(() =>
      calculate(edmonton({ options: [{ ...B, source: { program: "amex_mr_ca", ratio: 0 } }] })),
    ).toThrow(ZodError);
    expect(() =>
      calculate(edmonton({ options: [{ ...B, source: { program: "amex_mr_ca", ratio: -1 } }] })),
    ).toThrow(ZodError);
    expect(() => calculate(edmonton({ cashPriceCents: 0 }))).toThrow(ZodError);
  });

  it("3: transfer rounds source points up", () => {
    const option = { ...B, points: 15_001, source: { program: "amex_mr_ca", ratio: 0.75 } };
    expect(calculate(edmonton({ options: [option] })).ranked[0].sourcePoints).toBe(20_002);
  });

  it("3b: float noise in the ratio doesn't add a point", () => {
    const option = { ...B, points: 3, source: { program: "amex_mr_ca", ratio: 0.1 } };
    expect(calculate(edmonton({ options: [option] })).ranked[0].sourcePoints).toBe(30);
  });

  it("4: no override and no catalog default is UNRATED, still ranked by cpp", () => {
    // Flying Blue has no catalog cpp; booked directly, it's 2.40¢ unrated.
    const direct = { ...B, id: "FB", source: undefined };
    const { ranked } = calculate(edmonton({ options: [A, direct] }));
    expect(ids(ranked)).toEqual(["FB", "A"]);
    expect(ranked[0]).toMatchObject({
      verdict: "UNRATED",
      target: null,
      targetSource: null,
      margin: null,
    });
  });

  describe("5: balances", () => {
    const owned = { ...B, ownerUserId: "owner" };

    it("moves an unaffordable option to outOfReach and re-ranks the rest", () => {
      const { ranked, outOfReach } = calculate(
        edmonton({
          options: [A, owned, C],
          balances: [{ userId: "owner", program: "amex_mr_ca", points: 10_000 }],
        }),
      );
      expect(ids(ranked)).toEqual(["A", "C"]);
      expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
      expect(outOfReach).toHaveLength(1);
      expect(outOfReach[0]).toMatchObject({
        id: "B",
        shortBy: 5_000,
        householdHoldings: [],
        coveredByHousehold: false,
      });
    });

    it("reports household cover when the partner's points close the gap", () => {
      const { outOfReach } = calculate(
        edmonton({
          options: [A, owned, C],
          balances: [
            { userId: "owner", program: "amex_mr_ca", points: 10_000 },
            { userId: "partner", program: "amex_mr_ca", points: 5_000 },
            { userId: "partner", program: "aeroplan", points: 99_000 },
          ],
        }),
      );
      expect(outOfReach[0]).toMatchObject({
        shortBy: 5_000,
        householdHoldings: [{ userId: "partner", points: 5_000 }],
        coveredByHousehold: true,
      });
    });

    it("keeps the option ranked with balanceUnknown when the owner's balance is unknown", () => {
      for (const balances of [[{ userId: "owner", program: "amex_mr_ca", points: null }], []]) {
        const { ranked, outOfReach } = calculate(edmonton({ options: [A, owned, C], balances }));
        expect(outOfReach).toEqual([]);
        expect(ranked[0]).toMatchObject({ id: "B", balanceUnknown: true });
      }
    });

    it("ranks an affordable option without the flag", () => {
      const { ranked } = calculate(
        edmonton({
          options: [owned],
          balances: [{ userId: "owner", program: "amex_mr_ca", points: 15_000 }],
        }),
      );
      expect(ranked[0]).toMatchObject({ id: "B", balanceUnknown: false });
    });
  });

  it("6a: empty options give an empty ranking and pay cash", () => {
    expect(calculate(edmonton({ options: [] }))).toEqual({
      ranked: [],
      outOfReach: [],
      recommendation: { verdict: "PAY_CASH" },
    });
  });

  it("6b: every option out of reach gives an empty ranking and pay cash", () => {
    const options = [A, B, C].map((o) => ({ ...o, ownerUserId: "owner" }));
    const { ranked, outOfReach, recommendation } = calculate(
      edmonton({
        options,
        balances: [
          { userId: "owner", program: "aeroplan", points: 1_000 },
          { userId: "owner", program: "amex_mr_ca", points: 1_000 },
        ],
      }),
    );
    expect(ranked).toEqual([]);
    expect(recommendation).toEqual({ verdict: "PAY_CASH" });
    expect(outOfReach.map((o) => [o.id, o.shortBy])).toEqual([
      ["B", 14_000],
      ["A", 29_000],
      ["C", 29_000],
    ]);
  });
});

describe("tie-breaks after margin", () => {
  it("fewer source points wins, then input order", () => {
    // Both 1.30¢ on Aeroplan (same margin): 39,000/30,000 and 26,000/20,000.
    const big = { ...A, id: "BIG" };
    const small = { ...A, id: "SMALL", points: 20_000, feesCents: 22_000 };
    const twin = { ...A, id: "TWIN" };
    const { ranked } = calculate(edmonton({ options: [big, twin, small] }));
    expect(ids(ranked)).toEqual(["SMALL", "BIG", "TWIN"]);
  });
});
