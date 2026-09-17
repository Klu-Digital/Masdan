import { describe, expect, it } from "vite-plus/test";

import { defaultCookieAttributes } from "./index";

// Importing `./index` builds a `betterAuth` instance and a `pg.Pool` at module
// load — safe under the test env floor, since `pg.Pool` opens no socket.

/** Web and API on separate hosts: the topology this template shipped with. */
const CROSS_SITE = {
  apiUrl: "https://api.example.com",
  webOrigin: "https://app.example.com",
};

/** Web and API behind one hostname, the SPA reaching the API on its own origin. */
const SAME_SITE = {
  apiUrl: "https://app.example.com",
  webOrigin: "https://app.example.com",
};

describe("defaultCookieAttributes", () => {
  it.each(["production", "staging"])(
    "uses the cross-site pair in %s when the API is a different site",
    (nodeEnv) => {
      expect(defaultCookieAttributes(nodeEnv, CROSS_SITE)).toEqual({
        httpOnly: true,
        sameSite: "none",
        secure: true,
      });
    }
  );

  it.each(["production", "staging"])(
    "stays Secure but relaxes to Lax in %s when the API shares the web app's site",
    (nodeEnv) => {
      expect(defaultCookieAttributes(nodeEnv, SAME_SITE)).toEqual({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      });
    }
  );

  it.each(["development", "test"])(
    "uses the same-site pair in %s, where there is no HTTPS to make Secure work",
    (nodeEnv) => {
      expect(defaultCookieAttributes(nodeEnv, CROSS_SITE)).toEqual({
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      });
    }
  );

  // A port is not part of a site, so the local two-port setup is same-site even
  // though the two URLs are different origins.
  it("treats localhost on two ports as one site", () => {
    expect(
      defaultCookieAttributes("production", {
        apiUrl: "http://localhost:1900",
        webOrigin: "http://localhost:2600",
      })
    ).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });

  /**
   * Covers a value that skipped validation: an unrecognised one must not
   * produce cookies no browser stores.
   */
  it("treats an unrecognised environment as not deployed", () => {
    expect(defaultCookieAttributes("qa", CROSS_SITE)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
  });

  /**
   * An unparseable URL must not read as same-site — that downgrades a
   * cross-site deployment to `Lax` and breaks sign-in silently.
   */
  it("treats an unparseable API URL as cross-site", () => {
    expect(
      defaultCookieAttributes("production", {
        apiUrl: "not-a-url",
        webOrigin: "https://app.example.com",
      })
    ).toEqual({
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });
  });
});
