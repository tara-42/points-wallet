import { describe, expect, it } from "vitest";
import { computeNetWorth, formatCpp, type Valuation } from "./net-worth";

const pot: Valuation = {
  cpp: 2.0,
  source: "Prince of Travel",
  sourceUrl: "https://princeoftravel.com/guides/quarterly-valuation-updates/",
  asOf: "2026-05-01",
};
const valuations = {
  aeroplan: pot,
  dynamite: { cpp: 3.33, source: "Dynamite", sourceUrl: "https://www.dynamite.com/", asOf: "2026-10-17" },
};

describe("computeNetWorth", () => {
  it("rounds each line to the cent, then sums", () => {
    // 301 × 3.33 = 1002.33 → 1002; 1 × 3.33 = 3.33 → 3. Sum of rounded lines is 1005 (not round(1005.66) = 1006).
    const result = computeNetWorth({
      balances: [
        { userId: "a", programId: "dynamite", points: 301 },
        { userId: "b", programId: "dynamite", points: 1 },
      ],
      valuations,
      overrides: {},
    });
    expect(result.lines.map((l) => l.cents)).toEqual([1002, 3]);
    expect(result.totalCents).toBe(1005);
    expect(result.byUser).toEqual({ a: 1002, b: 3 });
    expect(result.lines[0].math).toBe("301 × 3.33¢ = $10.02");
    expect(result.lines[0].basis).toBe("Dynamite, 2026-10-17");
  });

  it("values a line at the household target and keeps the catalog source visible", () => {
    const { lines, totalCents } = computeNetWorth({
      balances: [{ userId: "j", programId: "aeroplan", points: 60_000 }],
      valuations,
      overrides: { aeroplan: 3.0 },
    });
    expect(totalCents).toBe(180_000);
    expect(lines[0]).toMatchObject({ cpp: 3.0, cppSource: "override" });
    expect(lines[0].math).toBe("60,000 × 3.0¢ = $1,800.00");
    expect(lines[0].basis).toBe("your target 3.0¢ (catalog 2.0¢, Prince of Travel, 2026-05-01)");
  });

  it("lists unknown balances but excludes and counts them", () => {
    const result = computeNetWorth({
      balances: [
        { userId: "j", programId: "aeroplan", points: null },
        { userId: "j", programId: "aeroplan", points: 1_000 },
      ],
      valuations,
      overrides: {},
    });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toMatchObject({ cents: null, math: null });
    expect(result.unknownCount).toBe(1);
    expect(result.totalCents).toBe(2_000);
    expect(result.byUser).toEqual({ j: 2_000 });
  });

  it("excludes a program with no valuation separately from unknown balances", () => {
    const result = computeNetWorth({
      balances: [{ userId: "a", programId: "retired_program", points: 500 }],
      valuations,
      overrides: {},
    });
    expect(result).toMatchObject({ totalCents: 0, unknownCount: 0, unvaluedCount: 1, byUser: { a: 0 } });
  });

  it("formats ¢/pt with at least one decimal", () => {
    expect([2, 2.2, 3.33, 25, 0.1].map(formatCpp)).toEqual(["2.0", "2.2", "3.33", "25.0", "0.1"]);
  });
});
