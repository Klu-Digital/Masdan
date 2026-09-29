import { createFileRoute } from "@tanstack/react-router";

import { AdminJobsPage } from "@/modules/admin/components/jobs-page";

export const Route = createFileRoute("/_auth/admin/jobs")({
  component: AdminJobsPage,
  head: () => ({ meta: [{ title: "Jobs" }] }),
});
