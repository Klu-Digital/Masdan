import { auth } from "@k22i/auth";
import { env } from "@k22i/env/server";
import { honoLogger } from "@k22i/observability/hono";
import type { EvlogVariables } from "@k22i/observability/hono";
import { createAuthMiddleware } from "evlog/better-auth";
import type { BetterAuthInstance } from "evlog/better-auth";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { mountMetrics } from "./metrics";
import { mountOrpc } from "./orpc";
import { mountSecurityHeaders } from "./security-headers";

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

export const createApp = () => {
  const app = new Hono<EvlogVariables>();

  app.use(honoLogger());

  // Before CORS and before every route: a response that short-circuits ahead of
  // this middleware is a response that ships with no security headers at all.
  mountSecurityHeaders(app);

  mountMetrics(app);

  app.use(
    "*",
    cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      origin: env.CORS_ORIGIN,
    })
  );

  app.use("*", async (c, next) => {
    await identifyUser(c.get("log"), c.req.raw.headers, c.req.path);
    return next();
  });

  app.get("/", (c) => c.text("OK"));

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  mountOrpc(app);

  return app;
};
