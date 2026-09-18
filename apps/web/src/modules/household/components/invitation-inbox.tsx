import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import {
  acceptHouseholdInvitation,
  rejectHouseholdInvitation,
  userInvitationsQueryOptions,
} from "@/lib/organization";
import type { client } from "@/utils/orpc";

type Invitation = Awaited<
  ReturnType<typeof client.invitations.listForCurrentUser>
>[number] & {
  expired: boolean;
};

const InvitationRow = ({ invitation }: { invitation: Invitation }) => {
  const queryClient = useQueryClient();
  const { expired } = invitation;

  const accept = useMutation({
    mutationFn: () =>
      acceptHouseholdInvitation({
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        queryClient,
      }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: () => {
      toastManager.add({ title: "Invitation accepted", type: "success" });
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      rejectHouseholdInvitation({
        invitationId: invitation.id,
        queryClient,
      }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: () => {
      toastManager.add({ title: "Invitation declined", type: "success" });
    },
  });

  const actionPending = accept.isPending || reject.isPending;

  return (
    <TableRow>
      <TableCell>{invitation.organizationName}</TableCell>
      <TableCell>
        <Badge variant="outline">{invitation.role ?? "member"}</Badge>
      </TableCell>
      <TableCell>
        {expired ? (
          <Badge variant="outline">Expired</Badge>
        ) : (
          new Date(invitation.expiresAt).toLocaleDateString()
        )}
      </TableCell>
      <TableCell>
        {expired ? (
          <span className="text-muted-foreground text-sm">
            This invitation has expired.
          </span>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              disabled={actionPending}
              loading={accept.isPending}
              onClick={() => accept.mutate()}
              size="sm"
            >
              Accept
            </Button>
            <Button
              disabled={actionPending}
              loading={reject.isPending}
              onClick={() => reject.mutate()}
              size="sm"
              variant="ghost"
            >
              Decline
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
};

const InvitationTable = ({ invitations }: { invitations: Invitation[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Household</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Expires</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {invitations.map((invitation) => (
        <InvitationRow invitation={invitation} key={invitation.id} />
      ))}
    </TableBody>
  </Table>
);

const InvitationInboxContent = ({
  invitations,
}: {
  invitations: UseQueryResult<Invitation[]>;
}) => {
  if (invitations.isPending) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (invitations.isError) {
    return (
      <p className="text-muted-foreground text-sm">
        Could not load your household invitations.
      </p>
    );
  }

  if (invitations.data.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No pending invitations</EmptyTitle>
        <EmptyDescription>
          New household invitations will appear here.
        </EmptyDescription>
      </Empty>
    );
  }

  return <InvitationTable invitations={invitations.data} />;
};

const InvitationInbox = () => {
  const invitations = useQuery(userInvitationsQueryOptions());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Household invitations</CardTitle>
        <CardDescription>
          Invitations sent to your account appear here. No email or invite link
          is needed.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <InvitationInboxContent invitations={invitations} />
      </CardPanel>
    </Card>
  );
};

export default InvitationInbox;
