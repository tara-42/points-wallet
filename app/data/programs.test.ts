import { describe, expect, it } from "vitest";
import raw from "./programs.json";
import fixtures from "./demo-fixtures.json";
import { calculatorCatalog, catalog, catalogSchema, catalogValuations } from "./programs";
import { computeNetWorth } from "@/lib/net-worth";

const ids = new Set(catalog.programs.map((p) => p.id));

describe("program catalog", () => {
  it("every entry passes the schema", () => {
    expect(catalogSchema.safeParse(raw).success).toBe(true);
  });

  it("every transfer target exists in the catalog", () => {
    for (const p of catalog.programs) {
      for (const t of p.transfersTo) expect(ids, `${p.id} → ${t.program}`).toContain(t.program);
    }
  });

  it("every entry has an https recovery URL and a finder question that exists", () => {
    const questions = new Set(catalog.finderQuestions.map((q) => q.id));
    for (const p of catalog.programs) {
      expect(new URL(p.recovery.url).protocol, p.id).toBe("https:");
      expect(questions, p.id).toContain(p.finder.questionId);
    }
  });

  it("rejects a dangling transfer target, an http URL and an unknown finder question", () => {
    const broken = structuredClone(raw);
    broken.programs[4].transfersTo[0].program = "nowhere";
    broken.programs[0].recovery.url = "http://example.com";
    broken.programs[1].finder.questionId = "nope";
    const result = catalogSchema.safeParse(broken);
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(
      expect.arrayContaining([
        "programs.4.transfersTo.0.program",
        "programs.0.recovery.url",
        "programs.1.finder.questionId",
      ])
    );
  });

  it("builds the calculator's injected catalog", () => {
    expect(calculatorCatalog().amex_mr_ca).toEqual({ shortName: "Amex MR", cpp: 2.2 });
  });
});

describe("demo fixture net worth", () => {
  const userIds = fixtures.users.map((u) => u.key);
  const result = computeNetWorth({
    balances: fixtures.balances.map((b) => ({ userId: b.user, programId: b.program, points: b.points })),
    valuations: catalogValuations(),
    overrides: Object.fromEntries(fixtures.valuationOverrides.map((o) => [o.program, o.targetCpp])),
  });

  it("matches expected.netWorthCents", () => {
    const expected = fixtures.expected.netWorthCents;
    expect(Object.fromEntries(userIds.map((u) => [u, result.byUser[u]]))).toEqual({
      avery: expected.avery,
      jordan: expected.jordan,
    });
    expect(result.totalCents).toBe(expected.household);
    expect(result.unknownCount).toBe(fixtures.expected.unknownBalances);
    expect(result.unvaluedCount).toBe(0);
  });
});
