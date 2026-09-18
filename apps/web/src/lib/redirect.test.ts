import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_AUTHENTICATED_PATH, safeRedirect } from "@/lib/redirect";

const ORIGIN = "https://app.example.com";

describe("safeRedirect", () => {
  it("keeps a same-origin path, with its search and hash", () => {
    expect(safeRedirect("/settings/household?tab=members#invite", ORIGIN)).toBe(
      "/settings/household?tab=members#invite"
    );
  });

  it("falls back when the parameter is absent or empty", () => {
    expect(safeRedirect(undefined, ORIGIN)).toBe(DEFAULT_AUTHENTICATED_PATH);
    expect(safeRedirect("", ORIGIN)).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  // The whole reason this function exists: every one of these navigates off the
  // origin in a browser, and each is a working open redirect without the guard.
  it.each([
    "https://evil.example/phish",
    "http://evil.example/phish",
    "//evil.example/phish",
    String.raw`/\evil.example/phish`,
    `${"java"}script:alert(1)`,
    "data:text/html,<script>alert(1)</script>",
  ])("refuses %s", (hostile) => {
    expect(safeRedirect(hostile, ORIGIN)).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  it("refuses to send an authenticated user back to an auth entry point", () => {
    expect(safeRedirect("/login", ORIGIN)).toBe(DEFAULT_AUTHENTICATED_PATH);
    expect(safeRedirect("/signup", ORIGIN)).toBe(DEFAULT_AUTHENTICATED_PATH);
    expect(safeRedirect("/", ORIGIN)).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  it("allows an auth path as a prefix of a real destination", () => {
    expect(safeRedirect("/login-history", ORIGIN)).toBe("/login-history");
  });

  it("normalises traversal rather than letting it escape the origin", () => {
    expect(safeRedirect("/../../etc/passwd", ORIGIN)).toBe("/etc/passwd");
  });
});
