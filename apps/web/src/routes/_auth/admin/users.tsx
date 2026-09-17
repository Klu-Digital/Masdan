import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/admin/users")({
  component: Outlet,
  head: () => ({ meta: [{ title: "Users" }] }),
});
