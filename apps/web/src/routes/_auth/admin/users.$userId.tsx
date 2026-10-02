import { createFileRoute } from "@tanstack/react-router";

import { AdminUserDetailPage } from "@/modules/admin/components/user-detail-page";
import { orpc } from "@/utils/orpc";

// `loader` before `head`, or `loaderData` infers as `never`.
/* oxlint-disable sort-keys */
export const Route = createFileRoute("/_auth/admin/users/$userId")({
  component: AdminUserDetailPage,
  /** Seeds the cache the page reads, so the breadcrumb costs no extra request. */
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.admin.users.detail.queryOptions({
        input: { userId: params.userId },
      })
    ),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.user?.name ?? "User" }],
  }),
});
