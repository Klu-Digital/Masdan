import { sql } from "drizzle-orm";

import type { Database } from "../index";
import {
  financialInstitution,
  interestProduct,
  interestRateSchedule,
} from "../schema";
import { INSTITUTION_PRESETS, PRODUCT_PRESETS } from "./interest-presets";

export const seedInterestCatalog = async (
  db: Database
): Promise<{ institutions: number; products: number; schedules: number }> => {
  const institutions = await db
    .insert(financialInstitution)
    .values(INSTITUTION_PRESETS)
    .onConflictDoUpdate({
      set: {
        aliases: sql`excluded.aliases`,
        brandColor: sql`excluded.brand_color`,
        countryCode: sql`excluded.country_code`,
        institutionType: sql`excluded.institution_type`,
        logoKey: sql`excluded.logo_key`,
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        websiteUrl: sql`excluded.website_url`,
      },
      target: financialInstitution.key,
    })
    .returning({ id: financialInstitution.id, key: financialInstitution.key });
  const institutionId = new Map(institutions.map((row) => [row.key, row.id]));
  const idOf = (key: string): string => {
    const id = institutionId.get(key);
    if (!id) {
      throw new Error(`Interest preset names unknown institution ${key}`);
    }
    return id;
  };

  let schedules = 0;
  for (const preset of PRODUCT_PRESETS) {
    const [product] = await db
      .insert(interestProduct)
      .values({
        aliases: preset.aliases,
        channelInstitutionId: preset.channelInstitutionKey
          ? idOf(preset.channelInstitutionKey)
          : null,
        currencyCode: preset.currencyCode,
        institutionId: idOf(preset.institutionKey),
        key: preset.key,
        name: preset.name,
        notes: preset.notes,
        productType: preset.productType,
        sourceUrl: preset.sourceUrl,
      })
      .onConflictDoUpdate({
        set: {
          aliases: sql`excluded.aliases`,
          channelInstitutionId: sql`excluded.channel_institution_id`,
          currencyCode: sql`excluded.currency_code`,
          institutionId: sql`excluded.institution_id`,
          name: sql`excluded.name`,
          notes: sql`excluded.notes`,
          productType: sql`excluded.product_type`,
          sourceUrl: sql`excluded.source_url`,
        },
        target: interestProduct.key,
      })
      .returning({ id: interestProduct.id });
    if (!product || preset.schedules.length === 0) {
      continue;
    }
    const inserted = await db
      .insert(interestRateSchedule)
      .values(
        preset.schedules.map(({ term, ...schedule }) => ({
          ...schedule,
          productId: product.id,
          termCount: term?.count ?? null,
          termUnit: term?.unit ?? null,
        }))
      )
      // The version key is the only unique constraint a new row can hit.
      .onConflictDoNothing()
      .returning({ id: interestRateSchedule.id });
    schedules += inserted.length;
  }

  // A newer schedule ends the open one before it, per product and tenor.
  await db.execute(sql`
    UPDATE ${interestRateSchedule} AS s
    SET effective_to = n.next_from - 1
    FROM (
      SELECT id, lead(effective_from) OVER (
        PARTITION BY product_id, term_count, term_unit
        ORDER BY effective_from NULLS FIRST
      ) AS next_from
      FROM ${interestRateSchedule}
    ) AS n
    WHERE s.id = n.id AND s.effective_to IS NULL AND n.next_from IS NOT NULL
  `);

  return {
    institutions: institutions.length,
    products: PRODUCT_PRESETS.length,
    schedules,
  };
};
