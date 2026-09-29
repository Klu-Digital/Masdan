import { Button } from "@masdan/ui/components/button";
import { Spinner } from "@masdan/ui/components/spinner";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  getRouteApi,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";

import AuthShell from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import {
  acceptHouseholdInvitation,
  rejectHouseholdInvitation,
} from "@/lib/organization";
import { optionalSearchString } from "@/lib/search";
import { invalidateSession } from "@/lib/session";
import { orpc } from "@/utils/orpc";

// `getRouteApi` rather than `Route.useSearch()` so the components below do not
// have to reference `Route`, which is declared at the bottom of the file.
const routeApi = getRouteApi("/accept-invite");

const InvitationCard = ({ invitationId }: { invitationId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invitation = useQuery({
    ...orpc.invitations.preview.queryOptions({ input: { invitationId } }),
    // The card below renders the failure; a global toast would only restate it.
    meta: { suppressErrorToast: true },
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptHouseholdInvitation({ invitationId, queryClient }),
    onSuccess: async () => {
      toastManager.add({ title: "Invitation accepted", type: "success" });
      await navigate({ to: "/dashboard" });
    },
  });

  const decline = useMutation({
    mutationFn: () => rejectHouseholdInvitation({ invitationId, queryClient }),
    onSuccess: async () => {
      toastManager.add({ title: "Invitation declined", type: "success" });
      await navigate({ to: "/dashboard" });
    },
  });

  if (invitation.isPending) {
    return (
      <AuthShell title="Loading invitation">
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthShell>
    );
  }

  if (invitation.isError || !invitation.data) {
    return (
      <AuthShell
        description="This invite link has expired, been cancelled, or already been used. Ask whoever invited you for a new one."
        title="Invitation unavailable"
      >
        <div className="grid gap-2">
          <Button
            className="w-full"
            render={<Link to="/dashboard" />}
            size="lg"
            variant="secondary"
          >
            Go to the app
          </Button>
          <Button
            className="w-full"
            size="lg"
            onClick={async () => {
              await authClient.signOut();
              await invalidateSession(queryClient);
              await navigate({ to: "/login" });
            }}
            variant="ghost"
          >
            Sign in with a different account
          </Button>
        </div>
      </AuthShell>
    );
  }

  const { organizationName, inviterName, role } = invitation.data;

  return (
    <AuthShell
      description={`${inviterName} invited you to join their household as ${role ?? "member"}.`}
      title={`Join ${organizationName}`}
    >
      <div className="grid gap-2">
        <Button
          className="w-full"
          size="lg"
          loading={accept.isPending}
          onClick={() => accept.mutate()}
        >
          Accept invitation
        </Button>
        <Button
          className="w-full"
          size="lg"
          loading={decline.isPending}
          onClick={() => decline.mutate()}
          variant="ghost"
        >
          Decline
        </Button>
      </div>
    </AuthShell>
  );
};

const RouteComponent = () => {
  const { invitation } = routeApi.useSearch();

  if (!invitation) {
    return (
      <AuthShell
        description="That invitation link is missing its identifier. Ask whoever invited you to send it again."
        title="Invitation link incomplete"
      >
        <Button className="w-full" render={<Link to="/dashboard" />} size="lg">
          Go to the app
        </Button>
      </AuthShell>
    );
  }

  return <InvitationCard invitationId={invitation} />;
};

export const Route = createFileRoute("/accept-invite")({
  /**
   * Guards in neither of the usual directions: accepting needs a session, but
   * an already-authenticated visitor must be left alone, or the "signed in? go
   * to the dashboard" rule throws the invitation away. Signed-out visitors land
   * on sign-up, which reads the invitation back out of `redirect`.
   */
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ search: { redirect: location.href }, to: "/signup" });
    }
  },
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Accept invitation" }] }),
  validateSearch: z.object({ invitation: optionalSearchString }),
});
