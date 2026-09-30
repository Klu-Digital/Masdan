import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { INSTITUTION_TYPES } from "../reference/interest";
import { oneOf, timestamps } from "./columns";

/**
 * Reference data shipped by Masdan, like `currency`: no `organization_id`, and
 * seeded from `src/reference/interest-presets.ts` by post-migration scripts.
 * `key` is what the seed matches on, so a renamed bank keeps its accounts.
 */
export const financialInstitution = pgTable(
  "financial_institution",
  {
    aliases: text("aliases").array().default([]).notNull(),
    brandColor: text("brand_color").notNull(),
    countryCode: text("country_code").notNull(),
    ...timestamps(),
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    institutionType: text("institution_type", {
      enum: INSTITUTION_TYPES,
    }).notNull(),
    key: text("key").notNull().unique("financial_institution_key_key"),
    logoKey: text("logo_key").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    websiteUrl: text("website_url"),
  },
  (table) => [
    check(
      "financial_institution_type_chk",
      oneOf(table.institutionType, INSTITUTION_TYPES)
    ),
  ]
);
