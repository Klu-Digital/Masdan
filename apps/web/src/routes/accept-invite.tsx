import { Button } from "@masdan/ui/components/button";
import { Spinner } from "@masdan/ui/components/spinner";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SearchSchemaInput } from "@tanstack/react-router";
import {
  Link,
  createFileRoute,
  getRouteApi,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

import AuthShell from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import {
  acceptHouseholdInvitation,
  rejectHouseholdInvitation,
} from "@/lib/organization";
import { asOptionalString } from "@/lib/redirect";
import { invalidateSession } from "@/lib/session";

// `getRouteApi` rather than `Route.useSearch()` so the components below do not
// have to reference `Route`, which is declared at the bottom of the file.
const routeApi = getRouteApi("/accept-invite");

const InvitationCard = ({ invitationId }: { invitationId: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invitation = useQuery({
    // The card below renders the failure, including the "wrong account" case
    // that a global toast would only restate.
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });
      if (error) {
        throw new Error(error.message ?? "This invitation is no longer valid");
      }
      return data;
    },
    queryKey: ["invitation", invitationId],
    retry: false,
  });

  const accept = useMutation({
    mutationFn: (organizationId: string) =>
      acceptHouseholdInvitation({
        invitationId,
        organizationId,
        queryClient,
      }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      toastManager.add({ title: "Invitation accepted", type: "success" });
      await navigate({ to: "/dashboard" });
    },
  });

  const decline = useMutation({
    mutationFn: () => rejectHouseholdInvitation({ invitationId, queryClient }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
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
        // The most common cause is signing in with a different address than the
        // one that was invited, so the escape hatch matters more than the reason.
        description={
          invitation.error?.message ??
          "This invitation has expired, been cancelled, already been accepted or declined, or was sent to a different email address."
        }
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

  const { organizationName, inviterEmail, role } = invitation.data;

  return (
    <AuthShell
      description={`${inviterEmail} invited you to join their household as ${role}.`}
      title={`Join ${organizationName}`}
    >
      <div className="grid gap-2">
        <Button
          className="w-full"
          size="lg"
          loading={accept.isPending}
          onClick={() => accept.mutate(invitation.data.organizationId)}
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
   * Guards in neither of the usual directions: accepting needs a session,
   * because the server matches the invitation's email — but an
   * already-authenticated visitor must be left alone, or the "signed in? go to
   * the dashboard" rule throws the invitation away.
   */
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }
  },
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Accept invitation" }] }),
  validateSearch: (search: { invitation?: string } & SearchSchemaInput) => ({
    invitation: asOptionalString(search.invitation),
  }),
});
