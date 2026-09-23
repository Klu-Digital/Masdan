import { createFileRoute } from "@tanstack/react-router";

import InvitationInbox from "@/modules/household/components/invitation-inbox";

export const Route = createFileRoute("/_auth/invitations")({
  component: InvitationInbox,
  head: () => ({ meta: [{ title: "Invitations" }] }),
});
