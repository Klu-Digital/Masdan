import type * as TypeImport__masdan_env_server from "@masdan/env/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

/**
 * `env` is frozen at import, but `resolveClientIp` reads it at call time, so a
 * Proxy can override per test.
 */
const overrides = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("@masdan/env/server", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport__masdan_env_server>();
  const overridden = (prop: string | symbol): prop is string =>
    typeof prop === "string" && prop in overrides.current;

  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, prop) =>
        overridden(prop) ? overrides.current[prop] : Reflect.get(target, prop),
      getOwnPropertyDescriptor: (target, prop) =>
        overridden(prop)
          ? {
              configurable: true,
              enumerable: true,
              value: overrides.current[prop],
            }
          : Reflect.getOwnPropertyDescriptor(target, prop),
      has: (target, prop) => overridden(prop) || Reflect.has(target, prop),
      ownKeys: (target) => [
        ...new Set([
          ...Reflect.ownKeys(target),
          ...Object.keys(overrides.current),
        ]),
      ],
    }),
  };
});

const { resolveClientIp } = await import("./client-ip");

beforeEach(() => {
  overrides.current = {};
});

describe("resolveClientIp", () => {
  it("ignores proxy headers and returns remoteAddress when TRUST_PROXY_HEADERS is false", () => {
    overrides.current = { TRUST_PROXY_HEADERS: false };
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7" });

    expect(resolveClientIp(headers, "10.0.0.1")).toBe("10.0.0.1");
  });

  it("takes the first hop of a multi-hop x-forwarded-for chain when trusted", () => {
    overrides.current = { TRUST_PROXY_HEADERS: true };
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.2, 10.0.0.3",
    });

    expect(resolveClientIp(headers, "10.0.0.1")).toBe("203.0.113.7");
  });

  it("trims whitespace around the first hop", () => {
    overrides.current = { TRUST_PROXY_HEADERS: true };
    const headers = new Headers({
      "x-forwarded-for": "  203.0.113.7  , 10.0.0.2",
    });

    expect(resolveClientIp(headers, "10.0.0.1")).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    overrides.current = { TRUST_PROXY_HEADERS: true };
    const headers = new Headers({ "x-real-ip": "198.51.100.9" });

    expect(resolveClientIp(headers, "10.0.0.1")).toBe("198.51.100.9");
  });

  it("falls back to cf-connecting-ip when neither x-forwarded-for nor x-real-ip is present", () => {
    overrides.current = { TRUST_PROXY_HEADERS: true };
    const headers = new Headers({ "cf-connecting-ip": "192.0.2.5" });

    expect(resolveClientIp(headers, "10.0.0.1")).toBe("192.0.2.5");
  });

  it("returns undefined when nothing is available", () => {
    overrides.current = { TRUST_PROXY_HEADERS: true };
    const headers = new Headers();

    expect(resolveClientIp(headers)).toBeUndefined();
  });
});
