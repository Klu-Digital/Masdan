import type { AppRouterClient } from "@masdan/api/routers/index";
import type { EvlogVariables } from "@masdan/observability/hono";
import { signUpTestUser } from "@masdan/testing";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";

import { createApp } from "./app";
import { mountOrpc } from "./orpc";

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

const appWithOrpc = (apiReference: boolean) => {
  const bare = new Hono<EvlogVariables>();
  mountOrpc(bare, { apiReference });
  return bare;
};

describe("GET /", () => {
  it("returns 200 OK for the Docker healthcheck", async () => {
    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});

describe("x-request-id", () => {
  it("generates one when absent and echoes an inbound one", async () => {
    const generated = await app.request("/");
    expect(generated.headers.get("x-request-id")).toBeTruthy();

    const echoed = await app.request("/", {
      headers: { "x-request-id": "req-from-proxy" },
    });
    expect(echoed.headers.get("x-request-id")).toBe("req-from-proxy");
  });
});

describe("GET /health/ready", () => {
  it("is 503 until the queue has started, naming what is missing", async () => {
    const response = await app.request("/health/ready");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ database: true });
  });
});

describe("POST /rpc body limit", () => {
  it("rejects a body over 1MiB with 413 before the handler runs", async () => {
    const response = await app.request("/rpc/currencies/list", {
      body: JSON.stringify({ json: "x".repeat(1024 * 1024) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(413);
  });
});

describe("/api-reference", () => {
  it("serves the OpenAPI spec when enabled", async () => {
    const response = await appWithOrpc(true).request(
      "/api-reference/spec.json"
    );

    expect(response.status).toBe(200);
  });

  it("is not mounted when disabled, as in production", async () => {
    const response = await appWithOrpc(false).request(
      "/api-reference/spec.json"
    );

    expect(response.status).toBe(404);
  });
});

describe("POST /rpc/currencies/list", () => {
  it("returns 401 without auth", async () => {
    const client = clientWithHeaders();

    await expect(client.currencies.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns the reference currencies over real HTTP when authenticated", async () => {
    const { headers } = await signUpTestUser();
    const client = clientWithHeaders(headers);

    const result = await client.currencies.list();

    expect(result.length).toBeGreaterThan(0);
  });
});
