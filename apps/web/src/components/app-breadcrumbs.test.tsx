import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import AppBreadcrumbs from "@/components/app-breadcrumbs";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <AppBreadcrumbs />
      <Outlet />
    </>
  ),
  // Stands in for the real root's product name, which must not become a crumb.
  head: () => ({ meta: [{ title: "k22i" }] }),
});

// A pathless layout with no title of its own — it should contribute nothing.
const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_auth",
});

const adminRoute = createRoute({
  component: Outlet,
  getParentRoute: () => layoutRoute,
  head: () => ({ meta: [{ title: "Admin" }] }),
  path: "/admin",
});

const usersRoute = createRoute({
  component: Outlet,
  getParentRoute: () => adminRoute,
  head: () => ({ meta: [{ title: "Users" }] }),
  path: "/users",
});

/* oxlint-disable sort-keys */
const userRoute = createRoute({
  component: () => null,
  getParentRoute: () => usersRoute,
  path: "/$userId",
  // `loader` above `head` — see `routes/_auth/admin/users.$userId.tsx` for why
  // the reverse order types `loaderData` as `never`.
  loader: ({ params }) =>
    Promise.resolve(params.userId === "1" ? { name: "Ada Lovelace" } : null),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.name ?? "User" }],
  }),
});
/* oxlint-enable sort-keys */

const renderAt = (path: string) => {
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree: rootRoute.addChildren([
      layoutRoute.addChildren([
        adminRoute.addChildren([usersRoute.addChildren([userRoute])]),
      ]),
    ]),
  });

  render(<RouterProvider router={router} />);
};

describe("AppBreadcrumbs", () => {
  it("builds the trail from each match's head title", async () => {
    renderAt("/admin/users");

    await waitFor(() => {
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("leaves the root route's title out of the trail", async () => {
    renderAt("/admin/users");

    await waitFor(() => {
      expect(screen.getByText("Admin")).toBeInTheDocument();
    });
    expect(screen.queryByText("k22i")).not.toBeInTheDocument();
  });

  it("names a dynamic crumb from the route's loader data", async () => {
    renderAt("/admin/users/1");

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });
  });

  it("falls back to the static label when the loader resolves to nothing", async () => {
    renderAt("/admin/users/2");

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
  });

  it("links every crumb but the last", async () => {
    renderAt("/admin/users/1");

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin"
    );
    expect(
      screen.queryByRole("link", { name: "Ada Lovelace" })
    ).not.toBeInTheDocument();
  });
});
