import type { EvlogVariables } from "@masdan/observability/hono";
import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";

import { mountSecurityHeaders } from "./security-headers";

const appWithHeaders = () => {
  const app = new Hono<EvlogVariables>();
  mountSecurityHeaders(app);
  app.get("/", (c) => c.text("OK"));
  app.get("/api-reference", (c) => c.html("<h1>docs</h1>"));
  app.get("/api-reference/spec.json", (c) => c.json({}));
  return app;
};

/** Splits `default-src 'none'; frame-ancestors 'none'` into a directive map. */
const directives = (csp: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (csp ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/u);
        return [name, values.join(" ")];
      })
  );

describe("mountSecurityHeaders", () => {
  it("sets the standard headers on an ordinary API response", async () => {
    const res = await appWithHeaders().request("/");

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  // The default `same-origin` would contradict the CORS config next to it.
  it("allows cross-origin embedding of API responses", async () => {
    const res = await appWithHeaders().request("/");

    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe(
      "cross-origin"
    );
  });

  it("locks the CSP all the way down on API routes", async () => {
    const res = await appWithHeaders().request("/");

    const csp = directives(
      res.headers.get("Content-Security-Policy") ?? undefined
    );
    expect(csp["default-src"]).toBe("'none'");
    expect(csp["frame-ancestors"]).toBe("'none'");
    expect(csp["form-action"]).toBe("'none'");
    expect(csp["base-uri"]).toBe("'none'");
  });

  // The docs page loads a jsDelivr bundle and an inline script, so a
  // `default-src 'none'` policy renders it blank — the regression guarded here.
  it("relaxes the CSP enough for the Scalar docs page to load", async () => {
    const res = await appWithHeaders().request("/api-reference");

    const csp = directives(
      res.headers.get("Content-Security-Policy") ?? undefined
    );
    expect(csp["default-src"]).toBe("'self'");
    expect(csp["script-src"]).toContain("https://cdn.jsdelivr.net");
    expect(csp["script-src"]).toContain("'unsafe-inline'");
  });

  it("applies the docs CSP to paths nested under the docs prefix", async () => {
    const res = await appWithHeaders().request("/api-reference/spec.json");

    const csp = directives(
      res.headers.get("Content-Security-Policy") ?? undefined
    );
    expect(csp["default-src"]).toBe("'self'");
  });

  // Shares a prefix with the docs route without being under it, so a bare
  // `startsWith` would hand it the loose policy.
  it("does not hand the docs CSP to a route that merely shares its prefix", async () => {
    const app = appWithHeaders();
    app.get("/api-reference-internal", (c) => c.text("OK"));

    const res = await app.request("/api-reference-internal");

    const csp = directives(
      res.headers.get("Content-Security-Policy") ?? undefined
    );
    expect(csp["default-src"]).toBe("'none'");
  });

  it("strips X-Powered-By", async () => {
    const app = appWithHeaders();
    app.get("/powered", (c) => {
      c.header("X-Powered-By", "Express");
      return c.text("OK");
    });

    const res = await app.request("/powered");

    expect(res.headers.get("X-Powered-By")).toBeNull();
  });
});
