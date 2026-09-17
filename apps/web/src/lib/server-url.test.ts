import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { getServerUrl } from "@/lib/server-url";

// jsdom gives us `window` by default, so the server-side branches must
// explicitly remove it for the duration of a test and restore it after.
const withoutWindow = <T>(fn: () => T): T => {
  // The stubbed value, so it cannot be dropped.
  // oxlint-disable-next-line unicorn/no-useless-undefined
  vi.stubGlobal("window", undefined);
  try {
    return fn();
  } finally {
    vi.unstubAllGlobals();
  }
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getServerUrl", () => {
  it("server-side: returns SERVER_URL with a trailing slash stripped", () => {
    vi.stubEnv("SERVER_URL", "https://internal.example.com/");
    const result = withoutWindow(() => getServerUrl("/anything"));
    expect(result).toBe("https://internal.example.com");
  });

  it("SERVER_URL takes precedence over an absolute url argument", () => {
    vi.stubEnv("SERVER_URL", "https://internal.example.com");
    const result = withoutWindow(() =>
      getServerUrl("https://elsewhere.example.com")
    );
    expect(result).toBe("https://internal.example.com");
  });

  it("an absolute url argument is returned as-is, short-circuiting later branches", () => {
    vi.stubEnv("VERCEL_URL", "my-app.vercel.app");
    const result = withoutWindow(() =>
      getServerUrl("https://elsewhere.example.com/")
    );
    expect(result).toBe("https://elsewhere.example.com");
  });

  it("in the browser, resolves a relative path against window.location.origin", () => {
    const result = getServerUrl("/rpc/");
    expect(result).toBe(`${window.location.origin}/rpc`);
  });

  // "/" is the same-origin spelling and the one input that normalizes to the
  // empty string.
  it('in the browser, "/" resolves to the bare origin with no trailing slash', () => {
    const result = getServerUrl("/");
    expect(result).toBe(window.location.origin);
  });

  it('server-side, "/" falls back to the bare localhost origin', () => {
    const result = withoutWindow(() => getServerUrl("/"));
    expect(result).toBe("http://localhost:1900");
  });

  it("server-side Vercel: prepends https:// to a bare host", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "my-app.vercel.app");
    const result = withoutWindow(() => getServerUrl("/rpc"));
    expect(result).toBe("https://my-app.vercel.app/rpc");
  });

  it("falls back to http://localhost:1900 when server-side with no SERVER_URL or Vercel env vars", () => {
    const result = withoutWindow(() => getServerUrl("/rpc"));
    expect(result).toBe("http://localhost:1900/rpc");
  });
});
