import type { AppRouterClient } from "@masdan/api/routers/index";
import { signUpTestUser } from "@masdan/testing";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { describe, expect, it } from "vite-plus/test";

import { createApp } from "./app";

const app = createApp();

const clientWithHeaders = (headers?: Headers): AppRouterClient => {
  const link = new RPCLink({
    fetch: async (request) => {
      if (!headers) {
        return await app.request(request);
      }
      const merged = new Headers(request.headers);
      for (const [key, value] of headers) {
        merged.set(key, value);
      }
      return await app.request(new Request(request, { headers: merged }));
    },
    url: "http://localhost/rpc",
  });
  return createORPCClient(link);
};

describe("GET /", () => {
  it("returns 200 OK for the Docker healthcheck", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});

describe("POST /rpc/healthCheck", () => {
  it("returns OK over real HTTP through the RPC handler", async () => {
    const client = clientWithHeaders();

    const result = await client.healthCheck();

    expect(result).toBe("OK");
  });
});

describe("POST /rpc/privateData", () => {
  it("returns 401 without auth", async () => {
    const client = clientWithHeaders();

    await expect(client.privateData()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns the signed-up user's email when authenticated", async () => {
    const { user, headers } = await signUpTestUser();
    const client = clientWithHeaders(headers);

    const result = await client.privateData();

    expect(result.user?.email).toBe(user.email);
  });
});
