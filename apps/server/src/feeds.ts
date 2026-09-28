import { renderBillFeed } from "@masdan/api/bills/bills.feed";
import { db } from "@masdan/db";
import { log, parseError } from "@masdan/observability";
import type { EvlogVariables } from "@masdan/observability/hono";
import type { Hono } from "hono";

const ICS_SUFFIX = ".ics";

/**
 * Calendar subscriptions. A calendar app sends no cookie, so the unguessable
 * token in the path is the whole credential; mounted ahead of CORS and session
 * lookup like the chat webhooks. Every miss is the same 404, so a caller
 * cannot tell a revoked token from one that never existed.
 */
export const mountFeeds = (app: Hono<EvlogVariables>) => {
  app.get("/feeds/bills/:file", async (c) => {
    const file = c.req.param("file");
    if (!file.endsWith(ICS_SUFFIX)) {
      return c.text("Not found", 404);
    }
    try {
      const body = await renderBillFeed(
        db,
        file.slice(0, -ICS_SUFFIX.length),
        new Date()
      );
      if (body === null) {
        return c.text("Not found", 404);
      }
      return c.body(body, 200, {
        // Per-subscriber content: shared caches must never keep a copy.
        "Cache-Control": "private, no-store",
        "Content-Type": "text/calendar; charset=utf-8",
      });
    } catch (error) {
      log.error({ action: "feeds.bills.failed", ...parseError(error) });
      return c.text("Feed unavailable", 503);
    }
  });
};
