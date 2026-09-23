import { Mail01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
} from "@masdan/ui/components/list";
import {
  Page,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";

import { HouseholdMark } from "@/components/shell/household-switcher";
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

const expiryFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

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
      toastManager.add({
        title: `You joined ${invitation.organizationName}`,
        type: "success",
      });
    },
  });

  const reject = useMutation({
    mutationFn: () =>
      rejectHouseholdInvitation({ invitationId: invitation.id, queryClient }),
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: () => {
      toastManager.add({ title: "Invitation declined", type: "success" });
    },
  });

  const actionPending = accept.isPending || reject.isPending;

  return (
    <ListItem className="flex-wrap">
      <ListItemLeading>
        <HouseholdMark name={invitation.organizationName} />
      </ListItemLeading>
      <ListItemContent>
        <ListItemTitle>{invitation.organizationName}</ListItemTitle>
        <ListItemDescription>
          {expired
            ? "This invitation has expired"
            : `As ${invitation.role ?? "member"} · expires ${expiryFormat.format(new Date(invitation.expiresAt))}`}
        </ListItemDescription>
      </ListItemContent>
      <ListItemTrailing>
        {expired ? (
          <Badge variant="outline">Expired</Badge>
        ) : (
          <>
            <Button
              disabled={actionPending}
              loading={reject.isPending}
              onClick={() => reject.mutate()}
              size="sm"
              variant="ghost"
            >
              Decline
            </Button>
            <Button
              disabled={actionPending}
              loading={accept.isPending}
              onClick={() => accept.mutate()}
              size="sm"
            >
              Join
            </Button>
          </>
        )}
      </ListItemTrailing>
    </ListItem>
  );
};

const InvitationInboxContent = ({
  invitations,
}: {
  invitations: UseQueryResult<Invitation[]>;
}) => {
  if (invitations.isPending) {
    return <Skeleton className="h-32 w-full" radius="2xl" />;
  }
  if (invitations.isError) {
    return (
      <p className="text-muted-foreground text-sm">
        Couldn’t load your household invitations.
      </p>
    );
  }
  if (invitations.data.length === 0) {
    return (
      <Empty size="compact">
        <EmptyMedia>
          <HugeiconsIcon icon={Mail01Icon} strokeWidth={1.8} />
        </EmptyMedia>
        <EmptyTitle>No invitations</EmptyTitle>
        <EmptyDescription>
          When someone invites your email to their household, it appears here.
        </EmptyDescription>
      </Empty>
    );
  }
  return (
    <List aria-label="Household invitations">
      {invitations.data.map((invitation) => (
        <InvitationRow invitation={invitation} key={invitation.id} />
      ))}
    </List>
  );
};

const InvitationInbox = () => {
  const invitations = useQuery(userInvitationsQueryOptions());
  return (
    <Page width="narrow">
      <PageHeader>
        <PageHeading>
          <PageTitle>Invitations</PageTitle>
          <PageDescription>
            Households that have invited you. Joining one switches you to it.
          </PageDescription>
        </PageHeading>
      </PageHeader>
      <InvitationInboxContent invitations={invitations} />
    </Page>
  );
};

export default InvitationInbox;
