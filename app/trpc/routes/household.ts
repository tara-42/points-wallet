import { z } from "zod/v4";
import { asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, type Context } from "..";
import { household, householdMember, user } from "@/db/schema";

// 32 characters with no look-alikes (no 0/O, 1/I). 256 is a multiple of 32, so `byte % 32` is unbiased.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_LENGTH));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

// D1 errors arrive wrapped by Drizzle; walk the cause chain for "UNIQUE constraint failed: <table.column>".
function isUniqueViolation(err: unknown, column: string): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (e.message.includes("UNIQUE constraint failed") && e.message.includes(column)) return true;
  }
  return false;
}

const alreadyInHousehold = () =>
  new TRPCError({ code: "CONFLICT", message: "You already belong to a household" });

async function getMembership(db: Context["db"], userId: string) {
  return db.query.householdMember.findFirst({ where: eq(householdMember.userId, userId) });
}

export const householdRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getMembership(ctx.db, ctx.auth.user.id);
    if (!membership) return null;

    const [home] = await ctx.db
      .select({ id: household.id, name: household.name, inviteCode: household.inviteCode })
      .from(household)
      .where(eq(household.id, membership.householdId));

    const members = await ctx.db
      .select({ userId: householdMember.userId, name: user.name, role: householdMember.role })
      .from(householdMember)
      .innerJoin(user, eq(user.id, householdMember.userId))
      .where(eq(householdMember.householdId, membership.householdId))
      .orderBy(desc(householdMember.role), asc(user.name)); // "owner" sorts after "member", so desc puts owner first

    return { household: home, role: membership.role, members };
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      if (await getMembership(ctx.db, userId)) throw alreadyInHousehold();

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const id = crypto.randomUUID();
        const inviteCode = generateInviteCode();
        try {
          // D1 batches run as one transaction: no household without its owner.
          await ctx.db.batch([
            ctx.db.insert(household).values({ id, name: input.name, inviteCode }),
            ctx.db.insert(householdMember).values({ userId, householdId: id, role: "owner" }),
          ]);
          return { id, name: input.name, inviteCode };
        } catch (err) {
          if (isUniqueViolation(err, "household.invite_code")) continue;
          if (isUniqueViolation(err, "household_member.user_id")) throw alreadyInHousehold();
          throw err;
        }
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not generate a unique invite code",
      });
    }),

  join: protectedProcedure
    .input(
      z.object({
        inviteCode: z
          .string()
          .trim()
          .toUpperCase()
          .length(INVITE_LENGTH, `Invite codes are ${INVITE_LENGTH} characters`),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.auth.user.id;
      if (await getMembership(ctx.db, userId)) throw alreadyInHousehold();

      const home = await ctx.db.query.household.findFirst({
        where: eq(household.inviteCode, input.inviteCode),
      });
      if (!home) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No household with that invite code" });
      }

      try {
        await ctx.db.insert(householdMember).values({ userId, householdId: home.id, role: "member" });
      } catch (err) {
        if (isUniqueViolation(err, "household_member.user_id")) throw alreadyInHousehold();
        throw err;
      }
      return { id: home.id, name: home.name };
    }),
});
