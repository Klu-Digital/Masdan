import { session, user } from "@masdan/db/schema/index";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../procedures";

/**
 * Read-only, and not scoped to `organizationId` — a session belongs to a user.
 * Revocation goes through better-auth's own mutation path, and `session.token`
 * is never selected: it is a bearer credential.
 */
export const sessionsPlatformRouter = {
  list: adminProcedure
    .input(
      z.object({
        activeOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        userId: z.uuid().optional(),
      })
    )
    .handler(({ context, input }) => {
      const conditions = [
        input.userId ? eq(session.userId, input.userId) : undefined,
        input.activeOnly ? gt(session.expiresAt, new Date()) : undefined,
      ].filter((condition) => condition !== undefined);

      return context.db
        .select({
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          id: session.id,
          impersonatedBy: session.impersonatedBy,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          userEmail: user.email,
          userId: user.id,
          userName: user.name,
        })
        .from(session)
        .innerJoin(user, eq(user.id, session.userId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(session.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),
};
