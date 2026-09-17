import {
  file,
  member,
  organization,
  session,
  user,
} from "@masdan/db/schema/index";
import { count, desc, eq, sum } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "../procedures";

/**
 * better-auth's `admin()` plugin owns every user mutation, so this router only
 * adds the combined read.
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
};
