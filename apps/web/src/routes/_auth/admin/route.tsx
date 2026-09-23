import { isPlatformAdmin } from "@masdan/auth/permissions";
import { Page } from "@masdan/ui/components/page";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

const AdminLayout = () => (
  <Page>
    <Outlet />
  </Page>
);

export const Route = createFileRoute("/_auth/admin")({
  beforeLoad: ({ context }) => {
    // Cosmetic only — `adminProcedure` on the server is the actual enforcement
    // point. This just keeps a non-admin from ever seeing the shell render.
    if (!isPlatformAdmin(context.session.user.role)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
  head: () => ({ meta: [{ title: "Admin" }] }),
});
