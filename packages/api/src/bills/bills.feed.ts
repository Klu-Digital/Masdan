import { createHash, randomBytes } from "node:crypto";

import { hasPermission } from "@masdan/auth/permissions";
import type { Database } from "@masdan/db";
import {
  billCalendarFeed,
  member,
  organization,
} from "@masdan/db/schema/index";
import { and, eq } from "drizzle-orm";

import { householdToday, monthEnd, monthStart } from "../reports/periods";
import { loadBills } from "./bills.queries";
import type { Bill } from "./bills.queries";
import { renderCalendar } from "./ical";
import type { CalendarEvent } from "./ical";

/** 256 random bits, base64url: unguessable, and the whole secret is the URL. */
const TOKEN_BYTES = 32;
const FEED_TOKEN_PATTERN = /^[\w-]{43}$/u;

/** The feed reaches this far back and ahead of the household's today. */
const FEED_MONTHS_BACK = 3;
const FEED_MONTHS_AHEAD = 12;

/** Writing `last_used_at` on every poll would be a write per calendar app per hour. */
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000;

export const generateFeedToken = (): string =>
  randomBytes(TOKEN_BYTES).toString("base64url");

/** Only the hash is stored, so a database read cannot subscribe to anyone's feed. */
export const hashFeedToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Relative, so the web client puts its own origin in front. */
export const feedPath = (token: string): string => `/feeds/bills/${token}.ics`;

const STATUS_LABELS: Record<Bill["status"], string> = {
  expected: "Due",
  overdue: "Overdue",
  paid: "Paid",
};

/**
 * Names and due dates only. A calendar app syncs this to its own servers and
 * shares it with whoever the subscriber shares the calendar with, so amounts,
 * balances and account details stay out.
 */
const feedEvents = (bills: readonly Bill[]): CalendarEvent[] =>
  bills.map((bill) => {
    let summary =
      bill.status === "paid" ? `${bill.name} (paid)` : `${bill.name} due`;
    let status = STATUS_LABELS[bill.status];
    if (bill.kind === "recurring") {
      status = bill.status === "paid" ? "Posted automatically" : "Scheduled";
      summary = `${bill.name} (${bill.transactionType}, ${status.toLowerCase()})`;
    }
    return {
      date: bill.dueDate,
      description: `${status}. Open Masdan for the amount.`,
      summary,
      uid: `${bill.key.replaceAll(":", "-")}@masdan`,
    };
  });

/**
 * The iCal text for a feed token, or null for any token that does not resolve
 * to a current member who may read bills. Membership and role are re-checked
 * on every request, so removing someone from the household kills their feed
 * without anyone remembering to revoke it.
 */
export const renderBillFeed = async (
  db: Database,
  token: string,
  now: Date
): Promise<string | null> => {
  if (!FEED_TOKEN_PATTERN.test(token)) {
    return null;
  }
  const [feed] = await db
    .select({
      id: billCalendarFeed.id,
      lastUsedAt: billCalendarFeed.lastUsedAt,
      organizationId: billCalendarFeed.organizationId,
      role: member.role,
      timezone: organization.timezone,
    })
    .from(billCalendarFeed)
    .innerJoin(
      member,
      and(
        eq(member.userId, billCalendarFeed.userId),
        eq(member.organizationId, billCalendarFeed.organizationId)
      )
    )
    .innerJoin(
      organization,
      eq(organization.id, billCalendarFeed.organizationId)
    )
    .where(eq(billCalendarFeed.tokenHash, hashFeedToken(token)))
    .limit(1);
  if (
    !feed ||
    !hasPermission({ permissions: { bill: ["read"] }, role: feed.role })
  ) {
    return null;
  }

  if (
    !feed.lastUsedAt ||
    now.getTime() - feed.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
  ) {
    await db
      .update(billCalendarFeed)
      .set({ lastUsedAt: now })
      .where(eq(billCalendarFeed.id, feed.id));
  }

  const today = householdToday(feed.timezone, now);
  const bills = await loadBills(db, feed.organizationId, {
    from: monthStart(today, -FEED_MONTHS_BACK),
    to: monthEnd(today, FEED_MONTHS_AHEAD),
    today,
  });
  return renderCalendar("Masdan calendar", feedEvents(bills), now);
};
