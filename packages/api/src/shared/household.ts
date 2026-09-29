import type { Database } from "@masdan/db";
import { organization } from "@masdan/db/schema/index";
import { eq } from "drizzle-orm";

import { householdToday } from "../reports/periods";
import { notFound } from "./errors";

export interface HouseholdSettings {
  defaultCurrency: string;
  timezone: string;
}

export const householdSettings = async (
  db: Database,
  organizationId: string
): Promise<HouseholdSettings> => {
  const [household] = await db
    .select({
      defaultCurrency: organization.defaultCurrency,
      timezone: organization.timezone,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!household) {
    throw notFound("Household");
  }
  return household;
};

/** Today's date where the household lives, never the server's. */
export const householdDate = async (
  db: Database,
  organizationId: string,
  now: Date = new Date()
): Promise<string> => {
  const { timezone } = await householdSettings(db, organizationId);
  return householdToday(timezone, now);
};
