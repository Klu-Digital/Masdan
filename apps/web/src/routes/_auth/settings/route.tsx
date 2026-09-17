import { Outlet, createFileRoute } from "@tanstack/react-router";

const SettingsLayout = () => (
  <div className="mx-auto w-full p-6">
    <Outlet />
  </div>
);

export const Route = createFileRoute("/_auth/settings")({
  component: SettingsLayout,
  head: () => ({ meta: [{ title: "Settings" }] }),
});
