import { z } from "zod";
import raw from "./programs.json";
import type { CalcInput } from "@/lib/calculator";
import type { Valuation } from "@/lib/net-worth";

// Typed loader for the program catalog (docs/SPEC.md §6). Parsed once at module load,
// so a bad edit to programs.json fails loudly instead of rendering wrong numbers.

export const categorySchema = z.enum([
  "travel",
  "groceries",
  "beauty",
  "food",
  "coffee",
  "retail",
  "bank",
]);
export type Category = z.infer<typeof categorySchema>;

const httpsUrl = z.url({ protocol: /^https$/ });
const isoDate = z.iso.date();

const programSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  shortName: z.string().min(1),
  category: categorySchema,
  unit: z.string().min(1),
  valuation: z.object({
    cpp: z.number().positive(),
    method: z.enum(["benchmark", "fixed", "estimate"]),
    source: z.string().min(1),
    sourceUrl: httpsUrl,
    asOf: isoDate,
    note: z.string(),
  }),
  transfersTo: z.array(
    z.object({
      program: z.string(),
      ratio: z.number().positive(),
      sourceUrl: httpsUrl,
      asOf: isoDate,
      note: z.string().optional(),
    })
  ),
  recovery: z.object({
    url: httpsUrl,
    identifier: z.string().min(1),
    tip: z.string(),
  }),
  finder: z.object({ questionId: z.string(), reason: z.string().min(1) }),
});
export type Program = z.infer<typeof programSchema>;
export type ProgramId = string;

export const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    currency: z.literal("CAD"),
    asOf: isoDate,
    valuationMethodology: z.string(),
    categories: z.array(categorySchema),
    finderQuestions: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })),
    programs: z.array(programSchema).min(1),
  })
  .superRefine((cat, ctx) => {
    const ids = new Set<string>();
    const questionIds = new Set(cat.finderQuestions.map((q) => q.id));
    cat.programs.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["programs", i, "id"], message: `Duplicate program id ${p.id}` });
      ids.add(p.id);
      if (!cat.categories.includes(p.category)) {
        ctx.addIssue({ code: "custom", path: ["programs", i, "category"], message: `Category ${p.category} not listed in categories` });
      }
      if (!questionIds.has(p.finder.questionId)) {
        ctx.addIssue({ code: "custom", path: ["programs", i, "finder", "questionId"], message: `Unknown finder question ${p.finder.questionId}` });
      }
    });
    cat.programs.forEach((p, i) =>
      p.transfersTo.forEach((t, j) => {
        if (!ids.has(t.program)) {
          ctx.addIssue({ code: "custom", path: ["programs", i, "transfersTo", j, "program"], message: `Unknown transfer target ${t.program}` });
        }
      })
    );
  });
export type Catalog = z.infer<typeof catalogSchema>;

export const catalog: Catalog = catalogSchema.parse(raw);

const byId = new Map(catalog.programs.map((p) => [p.id, p]));

export const isProgramId = (id: string): boolean => byId.has(id);
export const getProgram = (id: string): Program | undefined => byId.get(id);

/** Catalog transfer ratio (1 source pt → ratio target pts), or undefined if there's no such path. */
export function transferRatio(from: string, to: string): number | undefined {
  return byId.get(from)?.transfersTo.find((t) => t.program === to)?.ratio;
}

/** Programs that transfer into `to`, with their ratio. */
export function transferSources(to: string): { program: Program; ratio: number }[] {
  return catalog.programs.flatMap((p) => {
    const t = p.transfersTo.find((x) => x.program === to);
    return t ? [{ program: p, ratio: t.ratio }] : [];
  });
}

/** The injected catalog the redemption calculator expects. */
export function calculatorCatalog(): CalcInput["catalog"] {
  return Object.fromEntries(
    catalog.programs.map((p) => [p.id, { shortName: p.shortName, cpp: p.valuation.cpp }])
  );
}

/** Catalog valuations keyed by program id, for net worth. */
export function catalogValuations(): Record<ProgramId, Valuation> {
  return Object.fromEntries(
    catalog.programs.map((p) => [
      p.id,
      { cpp: p.valuation.cpp, source: p.valuation.source, sourceUrl: p.valuation.sourceUrl, asOf: p.valuation.asOf },
    ])
  );
}
