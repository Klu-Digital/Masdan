import {
  file,
  invitation,
  member,
  organization,
  session,
  user,
} from "@masdan/db/schema/index";
import { count, eq, gt, sql } from "drizzle-orm";

import { adminProcedure } from "../procedures";

export const overviewPlatformRouter = {
  /**
   * One row per day with at least one signup; missing days are simply absent.
   */
  signupsLast30Days: adminProcedure.handler(async ({ context }) => {
    const rows = await context.db.execute<{ day: string; count: string }>(
      sql`select (${user.createdAt} at time zone 'UTC')::date as day, count(*) as count
          from ${user}
          where ${user.createdAt} > now() - interval '30 days'
          group by 1
          order by 1`
    );

    return rows.rows.map((row) => ({
      count: Number(row.count),
      day: row.day,
    }));
  }),

  /**
   * Cross-tenant on purpose. Five cheap counts in parallel rather than one
   * folded query.
   */
  stats: adminProcedure.handler(async ({ context }) => {
    const now = new Date();

    const [
      [userCount],
      [organizationCount],
      [memberCount],
      [pendingInvitationCount],
      fileCountsByStatus,
      [activeSessionCount],
    ] = await Promise.all([
      context.db.select({ count: count() }).from(user),
      context.db.select({ count: count() }).from(organization),
      context.db.select({ count: count() }).from(member),
      context.db
        .select({ count: count() })
        .from(invitation)
        .where(eq(invitation.status, "pending")),
      context.db
        .select({ count: count(), status: file.status })
        .from(file)
        .groupBy(file.status),
      context.db
        .select({ count: count() })
        .from(session)
        .where(gt(session.expiresAt, now)),
    ]);

    return {
      activeSessions: activeSessionCount?.count ?? 0,
      files: {
        byStatus: Object.fromEntries(
          fileCountsByStatus.map((row) => [row.status, row.count])
        ),
        total: fileCountsByStatus.reduce((sum, row) => sum + row.count, 0),
      },
      members: memberCount?.count ?? 0,
      organizations: organizationCount?.count ?? 0,
      pendingInvitations: pendingInvitationCount?.count ?? 0,
      users: userCount?.count ?? 0,
    };
  }),
};
