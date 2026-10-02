import { and, asc, eq, isNull, notExists } from "drizzle-orm";

import { definePostMigration } from "../dev-scripts/post-migrate/define";
import { financialTransaction, interestCredit, member } from "../schema";

const isOwner = (role: string): boolean =>
  role.split(",").some((name) => name.trim() === "owner");

// Recurring postings and interest credits stay null: no person posted them.
export default definePostMigration({
  description:
    "Credit existing transactions to their household's longest-standing owner",
  async up({ db, log }) {
    const members = await db
      .select({
        organizationId: member.organizationId,
        role: member.role,
        userId: member.userId,
      })
      .from(member)
      .orderBy(asc(member.createdAt), asc(member.id));
    const owners = new Map<string, string>();
    for (const row of members) {
      if (isOwner(row.role) && !owners.has(row.organizationId)) {
        owners.set(row.organizationId, row.userId);
      }
    }

    let count = 0;
    for (const [organizationId, userId] of owners) {
      const updated = await db
        .update(financialTransaction)
        .set({ createdByUserId: userId })
        .where(
          and(
            eq(financialTransaction.organizationId, organizationId),
            isNull(financialTransaction.createdByUserId),
            isNull(financialTransaction.recurringScheduleId),
            notExists(
              db
                .select({ id: interestCredit.id })
                .from(interestCredit)
                .where(
                  and(
                    eq(interestCredit.organizationId, organizationId),
                    eq(interestCredit.transactionId, financialTransaction.id)
                  )
                )
            )
          )
        )
        .returning({ id: financialTransaction.id });
      count += updated.length;
    }
    log.info("transactions credited to owners", {
      count,
      households: owners.size,
    });
  },
});
