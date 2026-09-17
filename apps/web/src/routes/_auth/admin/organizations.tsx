import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/admin/organizations")({
  component: Outlet,
  head: () => ({ meta: [{ title: "Organizations" }] }),
});
