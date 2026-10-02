import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession },
}));

const { invalidateSession, sessionQueryOptions } =
  await import("@/lib/session");

const SESSION = { session: { id: "s1" }, user: { id: "u1" } };

/** What the root route does on every navigation. */
const resolveGuard = (queryClient: QueryClient) =>
  queryClient.ensureQueryData({
    ...sessionQueryOptions(),
    revalidateIfStale: true,
  });

describe("session cache", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    getSession.mockReset();
    queryClient = new QueryClient();
  });

  it("treats a signed-out response as an answer rather than an error", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    await expect(resolveGuard(queryClient)).resolves.toBeNull();
  });

  it("serves the guard from cache instead of refetching per navigation", async () => {
    getSession.mockResolvedValue({ data: SESSION, error: null });

    await resolveGuard(queryClient);
    await resolveGuard(queryClient);
    await resolveGuard(queryClient);

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  // Without a forced refetch, a successful sign-in bounces back to /login.
  it("gives the guard the new session after signing in, with nothing observing", async () => {
    getSession.mockResolvedValue({ data: null, error: null });
    await expect(resolveGuard(queryClient)).resolves.toBeNull();

    getSession.mockResolvedValue({ data: SESSION, error: null });
    await invalidateSession(queryClient);

    await expect(resolveGuard(queryClient)).resolves.toEqual(SESSION);
  });

  it("surfaces a transport failure rather than reporting it as signed out", async () => {
    getSession.mockResolvedValue({
      data: null,
      error: { message: "Network request failed" },
    });

    await expect(resolveGuard(queryClient)).rejects.toThrow(
      "Network request failed"
    );
  });
});
