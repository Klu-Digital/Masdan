import { Outlet, createFileRoute } from "@tanstack/react-router";

const ImportsLayout = () => <Outlet />;

export const Route = createFileRoute("/_auth/imports")({
  component: ImportsLayout,
  head: () => ({ meta: [{ title: "Import" }] }),
});
