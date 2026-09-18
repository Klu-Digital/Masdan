import { createFileRoute } from "@tanstack/react-router";

import InvitationInbox from "@/modules/household/components/invitation-inbox";

const RouteComponent = () => (
  <div className="mx-auto w-full space-y-6 p-6">
    <InvitationInbox />
  </div>
);

export const Route = createFileRoute("/_auth/invitations")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Invitations" }] }),
});
