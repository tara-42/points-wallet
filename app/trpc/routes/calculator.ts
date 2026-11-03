import { z } from "zod/v4";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "..";
import { balance, householdMember, user, valuationOverride } from "@/db/schema";
import { calculatorCatalog, getProgram, isProgramId, transferRatio } from "@/data/programs";
import { calculate, type PointsOption } from "@/lib/calculator";
import { requireHouseholdId } from "./wallet";

const programId = z.string().refine(isProgramId, "Unknown program");

const optionInput = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(80),
  program: programId,
  points: z.number().int().positive(),
  feesCents: z.number().int().nonnegative(),
  sourceProgram: programId.optional(), // ratio comes from the catalog, never the client
  ownerUserId: z.string().min(1).optional(),
});

export const calculatorRouter = createTRPCRouter({
  evaluate: protectedProcedure
    .input(
      z.object({
        cashPriceCents: z.number().int().positive(),
        options: z.array(optionInput).max(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db, ctx.auth.user.id);

      const members = await ctx.db
        .select({ userId: householdMember.userId, name: user.name })
        .from(householdMember)
        .innerJoin(user, eq(user.id, householdMember.userId))
        .where(eq(householdMember.householdId, householdId))
        .orderBy(asc(user.name));
      const memberIds = new Set(members.map((m) => m.userId));

      const options: PointsOption[] = input.options.map((o) => {
        if (o.ownerUserId && !memberIds.has(o.ownerUserId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Option ${o.label}: owner is not in your household` });
        }
        let source: PointsOption["source"];
        if (o.sourceProgram) {
          const ratio = transferRatio(o.sourceProgram, o.program);
          if (ratio === undefined) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Option ${o.label}: ${getProgram(o.sourceProgram)?.shortName} doesn't transfer to ${getProgram(o.program)?.shortName}`,
            });
          }
          source = { program: o.sourceProgram, ratio };
        }
        return {
          id: o.id,
          label: o.label,
          program: o.program,
          points: o.points,
          feesCents: o.feesCents,
          source,
          ownerUserId: o.ownerUserId,
        };
      });

      const balances = await ctx.db
        .select({ userId: balance.userId, program: balance.programId, points: balance.points })
        .from(balance)
        .where(eq(balance.householdId, householdId));

      const overrides = await ctx.db
        .select({ programId: valuationOverride.programId, targetCpp: valuationOverride.targetCpp })
        .from(valuationOverride)
        .where(eq(valuationOverride.householdId, householdId));

      const result = calculate({
        cashPriceCents: input.cashPriceCents,
        options,
        targetCpp: Object.fromEntries(overrides.map((o) => [o.programId, o.targetCpp])),
        catalog: calculatorCatalog(),
        balances,
      });

      return { result, members };
    }),
});
