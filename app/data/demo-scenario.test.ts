import { describe, expect, it } from "vitest";
import fixtures from "./demo-fixtures.json";
import { calculatorCatalog, transferRatio } from "./programs";
import { calculate, type PointsOption } from "@/lib/calculator";

// The demo household's Edmonton scenario, with real balances, the household's Aeroplan 3.0 target
// and the live catalog. Users are identified by fixture key.
describe("demo scenario: Edmonton for Christmas with the demo household", () => {
  const scenario = fixtures.calculatorScenario;
  const expected = fixtures.expected.scenario;

  const options: PointsOption[] = scenario.options.map((o) => ({
    id: o.id,
    label: o.label,
    program: o.program,
    points: o.points,
    feesCents: o.feesCents,
    ownerUserId: o.owner,
    source: o.source ? { program: o.source.program, ratio: transferRatio(o.source.program, o.program)! } : undefined,
  }));

  const result = calculate({
    cashPriceCents: scenario.cashPriceCents,
    options,
    targetCpp: Object.fromEntries(fixtures.valuationOverrides.map((o) => [o.program, o.targetCpp])),
    catalog: calculatorCatalog(),
    balances: fixtures.balances.map((b) => ({ userId: b.user, program: b.program, points: b.points })),
  });

  it("ranks the affordable options as expected", () => {
    expect(
      result.ranked.map((r) => ({
        id: r.id,
        cpp: Number(r.cpp.toFixed(2)),
        target: r.target,
        targetSource: r.targetSource,
        verdict: r.verdict,
      }))
    ).toEqual(expected.ranked);
  });

  it("puts B out of reach, covered by Jordan", () => {
    expect(
      result.outOfReach.map((o) => ({
        id: o.id,
        cpp: Number(o.cpp.toFixed(2)),
        shortBy: o.shortBy,
        householdHoldings: o.householdHoldings.map((h) => ({ user: h.userId, points: h.points })),
        coveredByHousehold: o.coveredByHousehold,
      }))
    ).toEqual(expected.outOfReach);
  });

  it("recommends paying cash", () => {
    expect(result.recommendation).toEqual({ verdict: "PAY_CASH" });
  });
});
