import { z } from "zod/v4";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, type Context } from "..";
import { balance, household, householdMember, user, valuationOverride } from "@/db/schema";
import { catalogValuations, isProgramId } from "@/data/programs";
import { computeNetWorth } from "@/lib/net-worth";

const programId = z.string().refine(isProgramId, "Unknown program");

export async function requireHouseholdId(db: Context["db"], userId: string): Promise<string> {
  const membership = await db.query.householdMember.findFirst({
    where: eq(householdMember.userId, userId),
  });
  if (!membership) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Create or join a household first" });
  }
  return membership.householdId;
}

export const walletRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db, ctx.auth.user.id);

    const [home] = await ctx.db
      .select({ id: household.id, name: household.name, inviteCode: household.inviteCode })
      .from(household)
      .where(eq(household.id, householdId));

    const members = await ctx.db
      .select({ userId: householdMember.userId, name: user.name, role: householdMember.role })
      .from(householdMember)
      .innerJoin(user, eq(user.id, householdMember.userId))
      .where(eq(householdMember.householdId, householdId))
      .orderBy(desc(householdMember.role), asc(user.name));

    const balances = await ctx.db
      .select({
        id: balance.id,
        userId: balance.userId,
        programId: balance.programId,
        points: balance.points,
        updatedAt: balance.updatedAt,
      })
      .from(balance)
      .where(eq(balance.householdId, householdId))
      .orderBy(asc(balance.programId), asc(balance.userId));

    const overrides = await ctx.db
      .select({ programId: valuationOverride.programId, targetCpp: valuationOverride.targetCpp })
      .from(valuationOverride)
      .where(eq(valuationOverride.householdId, householdId));

    const netWorth = computeNetWorth({
      balances,
      valuations: catalogValuations(),
      overrides: Object.fromEntries(overrides.map((o) => [o.programId, o.targetCpp])),
    });
    // Every member gets a subtotal, even with no balances yet.
    for (const m of members) netWorth.byUser[m.userId] ??= 0;

    return { household: home, me: ctx.auth.user.id, members, balances, netWorth };
  }),

  // Members edit only their own balances. points: null = unknown.
  upsertBalance: protectedProcedure
    .input(
      z.object({
        programId,
        points: z.number().int().nonnegative().max(1_000_000_000).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      const householdId = await requireHouseholdId(ctx.db, userId);
      await ctx.db
        .insert(balance)
        .values({ id: crypto.randomUUID(), householdId, userId, programId: input.programId, points: input.points })
        .onConflictDoUpdate({
          target: [balance.householdId, balance.userId, balance.programId],
          set: { points: input.points, updatedAt: new Date() },
        });
      return { ok: true };
    }),

  // Finder's "Add to wallet": records the program as unknown, but never touches an existing balance.
  addUnknown: protectedProcedure
    .input(z.object({ programId }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      const householdId = await requireHouseholdId(ctx.db, userId);
      const inserted = await ctx.db
        .insert(balance)
        .values({ id: crypto.randomUUID(), householdId, userId, programId: input.programId, points: null })
        .onConflictDoNothing({ target: [balance.householdId, balance.userId, balance.programId] })
        .returning({ id: balance.id });
      return { added: inserted.length > 0 };
    }),

  deleteBalance: protectedProcedure
    .input(z.object({ programId }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      const householdId = await requireHouseholdId(ctx.db, userId);
      await ctx.db
        .delete(balance)
        .where(
          and(
            eq(balance.householdId, householdId),
            eq(balance.userId, userId),
            eq(balance.programId, input.programId)
          )
        );
      return { ok: true };
    }),
});
