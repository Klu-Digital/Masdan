import type { Database } from "@masdan/db";
import { member, user } from "@masdan/db/schema/index";
import { asc, eq } from "drizzle-orm";

export const listHouseholdMembers = (db: Database, organizationId: string) =>
  db
    .select({
      id: member.id,
      name: user.name,
      role: member.role,
      userId: user.id,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(user.name), asc(member.id));
