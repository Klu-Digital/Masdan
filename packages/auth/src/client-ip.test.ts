import { describe, expect, it } from "vite-plus/test";

import { CLIENT_IP_HEADER, clientIpFrom, withClientIp } from "./client-ip";

const SOCKET = "10.0.0.1";

describe("clientIpFrom", () => {
  it("uses the socket and ignores x-forwarded-for with no trusted hops", () => {
    expect(clientIpFrom("203.0.113.7", SOCKET, 0)).toBe(SOCKET);
  });

  it("takes the entry the edge proxy appended, not one the caller sent", () => {
    // The caller sent `198.51.100.66`; nginx appended the address it saw.
    expect(clientIpFrom("198.51.100.66, 203.0.113.7", SOCKET, 1)).toBe(
      "203.0.113.7"
    );
  });

  it("counts back one entry per trusted proxy", () => {
    // Traefik -> nginx: Traefik wrote the client, nginx wrote Traefik.
    expect(
      clientIpFrom("198.51.100.66, 203.0.113.7, 172.18.0.5", SOCKET, 2)
    ).toBe("203.0.113.7");
  });

  it("takes the first entry when the chain is shorter than the hops", () => {
    expect(clientIpFrom(" 203.0.113.7 ", SOCKET, 2)).toBe("203.0.113.7");
  });

  it("falls back to the socket when the header is absent or not an address", () => {
    expect(clientIpFrom(null, SOCKET, 1)).toBe(SOCKET);
    expect(clientIpFrom("", SOCKET, 1)).toBe(SOCKET);
    expect(clientIpFrom("not-an-ip", SOCKET, 1)).toBe(SOCKET);
  });

  it("accepts IPv6", () => {
    expect(clientIpFrom("2001:db8::1", SOCKET, 1)).toBe("2001:db8::1");
  });
});

describe("withClientIp", () => {
  it("replaces a caller-sent header with the resolved address", () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      headers: { [CLIENT_IP_HEADER]: "198.51.100.66" },
    });

    expect(
      withClientIp(request, "203.0.113.7").headers.get(CLIENT_IP_HEADER)
    ).toBe("203.0.113.7");
  });

  it("strips a caller-sent header when no address is known", () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      headers: { [CLIENT_IP_HEADER]: "198.51.100.66" },
    });

    expect(withClientIp(request).headers.has(CLIENT_IP_HEADER)).toBe(false);
  });

  it("keeps the body", async () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      body: JSON.stringify({ email: "a@example.test" }),
      method: "POST",
    });

    expect(await withClientIp(request, "203.0.113.7").json()).toEqual({
      email: "a@example.test",
    });
  });
});
