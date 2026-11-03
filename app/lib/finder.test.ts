import { describe, expect, it } from "vitest";
import { catalog } from "@/data/programs";
import { findPrograms } from "./finder";

const find = (answers: string[]) =>
  findPrograms({ questions: catalog.finderQuestions, programs: catalog.programs, answers });

describe("findPrograms", () => {
  it("style + food returns Sephora, Dynamite and Domino's with https recovery URLs", () => {
    const results = find(["style", "food"]);
    expect(results.map((r) => r.programId)).toEqual(["sephora_bi", "dynamite", "dominos"]);
    for (const r of results) {
      expect(new URL(r.url).protocol).toBe("https:");
      expect(r.identifier).not.toBe("");
      expect(r.reason).not.toBe("");
    }
    expect(results[2]).toMatchObject({
      name: "Domino's Rewards (Canada)",
      reason: "You order pizza",
      question: { id: "food", text: "Do you order takeout pizza?" },
    });
  });

  it("returns nothing with no answers, and ignores unknown answer ids", () => {
    expect(find([])).toEqual([]);
    expect(find(["not-a-question"])).toEqual([]);
  });

  it("every program is reachable from some question", () => {
    const all = find(catalog.finderQuestions.map((q) => q.id));
    expect(all).toHaveLength(catalog.programs.length);
  });
});
