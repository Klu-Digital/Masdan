import { and, isNotNull, notLike } from "drizzle-orm";

import { definePostMigration } from "../dev-scripts/post-migrate/define";
import { financialAccount } from "../schema";

export default definePostMigration({
  description:
    "Prefix card product keys with their country: bpi-… becomes ph-bpi-…",
  async up({ db, log, sql }) {
    // Every key saved before the catalog had countries was a Philippine card.
    const renamed = await db
      .update(financialAccount)
      .set({ cardProductKey: sql`'ph-' || ${financialAccount.cardProductKey}` })
      .where(
        and(
          isNotNull(financialAccount.cardProductKey),
          notLike(financialAccount.cardProductKey, "ph-%")
        )
      )
      .returning({ id: financialAccount.id });

    log.info("card product keys prefixed", { count: renamed.length });
  },
});
