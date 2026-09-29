import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type * as TypeImport___utils_orpc from "@/utils/orpc";

vi.mock("@masdan/ui/components/toast", () => ({
  toastManager: { add: vi.fn(), close: vi.fn(), update: vi.fn() },
}));

/** Swapped per test to stand in for whatever the server would return. */
const response = vi.hoisted(() => ({
  current: (): Promise<unknown> => Promise.resolve({}),
}));

// Only `orpc` is replaced; `createQueryClient` stays real so these tests exercise
// the app's actual query configuration.
vi.mock("@/utils/orpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TypeImport___utils_orpc>();
  return {
    ...actual,
    orpc: {
      featureFlags: {
        all: {
          queryOptions: () => ({
            queryFn: () => response.current(),
            queryKey: ["featureFlags", "all"],
          }),
        },
      },
    },
  };
});

const { createQueryClient } = await import("@/utils/orpc");
const { useFeatureFlag } = await import("@/hooks/use-feature-flag");

const wrapper = () => {
  const queryClient = createQueryClient();
  // Keep the failure test from waiting out three retries with backoff.
  queryClient.setDefaultOptions({ queries: { retry: false } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const renderFlag = () =>
  renderHook(() => useFeatureFlag("FF__ASK_MASDAN"), { wrapper: wrapper() });

beforeEach(() => {
  response.current = () => Promise.resolve({});
});

describe("useFeatureFlag", () => {
  it("returns false while the flags are still loading", () => {
    // A promise that never settles — the query stays in its loading state.
    // oxlint-disable-next-line promise/avoid-new
    response.current = () => new Promise(() => {});

    const { result } = renderFlag();

    expect(result.current).toBe(false);
  });

  it("returns the server's value once the flags resolve", async () => {
    response.current = () => Promise.resolve({ FF__ASK_MASDAN: true });

    const { result } = renderFlag();

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false for a flag the server did not send", async () => {
    response.current = () => Promise.resolve({ FF__SOMETHING_ELSE: true });

    const { result } = renderFlag();

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("fails closed when the request errors", async () => {
    response.current = () => Promise.reject(new Error("UNAUTHORIZED"));

    const { result } = renderFlag();

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
