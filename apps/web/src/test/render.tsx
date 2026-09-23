import { QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vite-plus/test";

import { createQueryClient } from "@/utils/orpc";

/**
 * Renders a component inside a fresh query client and a memory router, so
 * `<Link>`s and menus that contain them work without the real route tree.
 */
export const renderWithProviders = (ui: ReactElement) => {
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree: rootRoute,
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

/** jsdom has no layout; pretend the viewport is wide (tablet and up). */
export const useWideViewport = () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: /min-width/u.test(query),
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }));
};
