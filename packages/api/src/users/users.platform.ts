import { issuePasswordResetLink } from "@masdan/auth/recovery";
import {
  file,
  member,
  organization,
  session,
  user,
} from "@masdan/db/schema/index";
import { log } from "@masdan/observability";
import { ORPCError } from "@orpc/server";
import { count, desc, eq, sum } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../procedures";

/**
 * better-auth's `admin()` plugin owns every user mutation, so this router adds
 * the combined read and the one thing that plugin cannot do: a reset link.
 */
export const usersPlatformRouter = {
  detail: adminProcedure
    .input(z.object({ userId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [[targetUser], memberships, sessions, [fileUsage]] =
        await Promise.all([
          context.db.select().from(user).where(eq(user.id, input.userId)),
          context.db
            .select({
              id: member.id,
              organizationId: organization.id,
              organizationName: organization.name,
              organizationSlug: organization.slug,
              role: member.role,
            })
            .from(member)
            .innerJoin(organization, eq(organization.id, member.organizationId))
            .where(eq(member.userId, input.userId)),
          // `session.token` is deliberately not selected here — it is a bearer
          // credential, and this page has no reason to ever display it.
          context.db
            .select({
              createdAt: session.createdAt,
              expiresAt: session.expiresAt,
              id: session.id,
              impersonatedBy: session.impersonatedBy,
              ipAddress: session.ipAddress,
              userAgent: session.userAgent,
            })
            .from(session)
            .where(eq(session.userId, input.userId))
            .orderBy(desc(session.createdAt)),
          context.db
            .select({ count: count(), totalBytes: sum(file.size) })
            .from(file)
            .where(eq(file.userId, input.userId)),
        ]);

      return {
        fileUsage: {
          count: fileUsage?.count ?? 0,
          totalBytes: Number(fileUsage?.totalBytes ?? 0),
        },
        memberships,
        sessions,
        user: targetUser ?? null,
      };
    }),

  /**
   * Written through better-auth's adapter, not this request's transaction. The
   * URL is a live account-takeover credential: return it, never log it.
   */
  issuePasswordReset: adminProcedure
    .input(z.object({ userId: z.uuid() }))
    .handler(async ({ context, input }) => {
      const [target] = await context.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.userId));
      if (!target) {
        throw new ORPCError("NOT_FOUND");
      }

      const link = await issuePasswordResetLink(target.id);
      log.info({
        action: "admin.password_reset.issued",
        actorId: context.session.user.id,
        userId: target.id,
      });
      return link;
    }),
};
