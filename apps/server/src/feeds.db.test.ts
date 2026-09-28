import type { AppRouterClient } from "@masdan/api/routers/index";
import { signUpTestUser } from "@masdan/testing";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, it } from "vite-plus/test";

import { createApp } from "./app";

const app = createApp();

const clientFor = (headers: Headers): AppRouterClient =>
  createORPCClient(
    new RPCLink({
      fetch: async (request) => {
        const merged = new Headers(request.headers);
        for (const [key, value] of headers) {
          merged.set(key, value);
        }
        return await app.request(new Request(request, { headers: merged }));
      },
      url: "http://localhost/rpc",
    })
  );

describe("GET /feeds/bills/:token.ics", () => {
  it("serves the calendar to a cookieless client holding the token", async () => {
    const { headers } = await signUpTestUser();
    const { path } = await clientFor(headers).bills.feed.create();

    const response = await app.request(path);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("BEGIN:VCALENDAR");
  });

  it("answers a revoked, unknown or malformed token with the same 404", async () => {
    const { headers } = await signUpTestUser();
    const client = clientFor(headers);
    const { path } = await client.bills.feed.create();
    await client.bills.feed.revoke();

    for (const url of [
      path,
      `/feeds/bills/${"a".repeat(43)}.ics`,
      "/feeds/bills/not-a-token.ics",
      path.replace(".ics", ".txt"),
    ]) {
      const response = await app.request(url);
      expect(response.status).toBe(404);
    }
  });
});
