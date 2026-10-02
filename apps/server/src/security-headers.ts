import type { EvlogVariables } from "@masdan/observability/hono";
import type { Hono, MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";

/** Where the Scalar docs UI mounts (see ./orpc.ts) — the only HTML this serves. */
const DOCS_PREFIX = "/api-reference";

/** Applied to both policies below. */
const shared = {
  // This server is read cross-origin, so Hono's `same-origin` default is wrong
  // here.
  crossOriginResourcePolicy: "cross-origin",
  // DENY rather than Hono's SAMEORIGIN: nothing here is ever meant to be framed.
  xFrameOptions: "DENY",
} as const;

const apiCsp = {
  baseUri: ["'none'"],
  defaultSrc: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
};

// `@orpc/openapi` injects an inline script with no nonce slot.
const docsCsp = {
  baseUri: ["'self'"],
  connectSrc: ["'self'"],
  defaultSrc: ["'self'"],
  fontSrc: [
    "'self'",
    "data:",
    "https://cdn.jsdelivr.net",
    "https://fonts.gstatic.com",
  ],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'", "data:", "https:"],
  scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://cdn.jsdelivr.net",
    "https://fonts.googleapis.com",
  ],
};

const isDocsPath = (path: string): boolean =>
  path === DOCS_PREFIX || path.startsWith(`${DOCS_PREFIX}/`);

// One middleware: `secureHeaders()` writes after `next()`, so nesting overwrites.
export const mountSecurityHeaders = (app: Hono<EvlogVariables>) => {
  const api = secureHeaders({ ...shared, contentSecurityPolicy: apiCsp });
  const docs = secureHeaders({ ...shared, contentSecurityPolicy: docsCsp });

  const dispatch: MiddlewareHandler<EvlogVariables> = (c, next) =>
    isDocsPath(c.req.path) ? docs(c, next) : api(c, next);

  app.use("*", dispatch);
};
