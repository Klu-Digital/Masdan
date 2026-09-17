import { hasPermission } from "@k22i/auth/permissions";
import { Badge } from "@k22i/ui/components/badge";
import { Button } from "@k22i/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@k22i/ui/components/card";
import { Empty, EmptyDescription, EmptyTitle } from "@k22i/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@k22i/ui/components/field";
import { Input } from "@k22i/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@k22i/ui/components/select";
import { Skeleton } from "@k22i/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@k22i/ui/components/table";
import { toastManager } from "@k22i/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  useRouter,
} from "@tanstack/react-router";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import {
  activeOrganizationQueryOptions,
  invalidateOrganizations,
} from "@/lib/organization";
import { invalidateSession } from "@/lib/session";

const routeApi = getRouteApi("/_auth/settings/organization");

/** `owner` is deliberately absent: it transfers, it is not handed out. */
const INVITABLE_ROLES = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
  { label: "Viewer", value: "viewer" },
] as const;

const MIN_ORGANIZATION_NAME_LENGTH = 2;

const inviteLink = (invitationId: string) =>
  `${window.location.origin}/accept-invite?invitation=${invitationId}`;

const MembersCard = ({
  canInvite,
  members,
}: {
  canInvite: boolean;
  members: {
    id: string;
    role: string;
    user: { email: string; name: string };
  }[];
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Members</CardTitle>
      <CardDescription>
        Everyone with access to this organization.
      </CardDescription>
    </CardHeader>
    <CardPanel>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>{member.user.name}</TableCell>
              <TableCell>
                <span className="text-muted-foreground">
                  {member.user.email}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{member.role}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {canInvite ? null : (
        <p className="text-muted-foreground mt-4 text-sm">
          Your role does not allow inviting people to this organization.
        </p>
      )}
    </CardPanel>
  </Card>
);

const InvitationsCard = ({
  invitations,
  organizationId,
}: {
  invitations: { email: string; id: string; role: string; status: string }[];
  organizationId: string;
}) => {
  const queryClient = useQueryClient();

  const cancel = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (error) {
        throw new Error(error.message ?? "Could not cancel the invitation");
      }
      await queryClient.invalidateQueries(
        activeOrganizationQueryOptions(organizationId)
      );
    },
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
  });

  const pending = invitations.filter(
    (invitation) => invitation.status === "pending"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>
          Copy a link to share it directly — useful before transactional email
          is wired up, and the only way in if an invite never arrives.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {pending.length === 0 ? (
          <Empty>
            <EmptyTitle>No pending invitations</EmptyTitle>
            <EmptyDescription>
              Invite someone below and their link will appear here.
            </EmptyDescription>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell>{invitation.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{invitation.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={async () => {
                          await navigator.clipboard.writeText(
                            inviteLink(invitation.id)
                          );
                          toastManager.add({
                            title: "Invite link copied",
                            type: "success",
                          });
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Copy link
                      </Button>
                      <Button
                        loading={cancel.isPending}
                        onClick={() => cancel.mutate(invitation.id)}
                        size="sm"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardPanel>
    </Card>
  );
};

const InviteForm = ({ organizationId }: { organizationId: string }) => {
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: { email: "", role: "member" as string },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.organization.inviteMember({
        email: value.email,
        organizationId,
        role: value.role as "admin" | "member",
      });
      if (error) {
        toastManager.add({
          title: error.message ?? "Could not send the invitation",
          type: "error",
        });
        return;
      }
      await queryClient.invalidateQueries(
        activeOrganizationQueryOptions(organizationId)
      );
      form.reset();
      toastManager.add({ title: "Invitation created", type: "success" });
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        role: z.string(),
      }),
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>
          They join this organization, not the app as a whole.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => (
              <Field className="flex-1" name={field.name}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="email"
                  value={field.state.value}
                />
                {field.state.meta.errors.map((error) => (
                  <FieldError key={error?.message} match>
                    {error?.message}
                  </FieldError>
                ))}
              </Field>
            )}
          </form.Field>

          <form.Field name="role">
            {(field) => (
              <Field className="sm:w-40" name={field.name}>
                <FieldLabel>Role</FieldLabel>
                <Select
                  items={INVITABLE_ROLES}
                  onValueChange={(value) => field.handleChange(value as string)}
                  value={field.state.value}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {INVITABLE_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            )}
          </form.Field>

          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                disabled={!canSubmit}
                loading={isSubmitting}
                type="submit"
              >
                Send invite
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardPanel>
    </Card>
  );
};

const CreateOrganizationCard = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      const { data, error } = await authClient.organization.create({
        // Derived to keep the form to one field; a collision comes back as a
        // server error rather than a silent rename.
        name: value.name,
        slug: value.name
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/gu, "-")
          .replaceAll(/^-+|-+$/gu, ""),
      });

      if (error || !data) {
        toastManager.add({
          title: error?.message ?? "Could not create the organization",
          type: "error",
        });
        return;
      }

      await authClient.organization.setActive({ organizationId: data.id });
      await invalidateSession(queryClient);
      await invalidateOrganizations(queryClient);
      await router.invalidate();
      form.reset();
      toastManager.add({ title: `Switched to ${data.name}`, type: "success" });
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .min(
            MIN_ORGANIZATION_NAME_LENGTH,
            `Name must be at least ${MIN_ORGANIZATION_NAME_LENGTH} characters`
          ),
      }),
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New organization</CardTitle>
        <CardDescription>
          Creating one makes it active immediately.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <form
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field className="flex-1" name={field.name}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  value={field.state.value}
                />
                {field.state.meta.errors.map((error) => (
                  <FieldError key={error?.message} match>
                    {error?.message}
                  </FieldError>
                ))}
              </Field>
            )}
          </form.Field>

          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                disabled={!canSubmit}
                loading={isSubmitting}
                type="submit"
                variant="outline"
              >
                Create
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardPanel>
    </Card>
  );
};

const RouteComponent = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );

  if (organization.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!organization.data) {
    return (
      <div className="space-y-6">
        <Empty>
          <EmptyTitle>No active organization</EmptyTitle>
          <EmptyDescription>
            Create one to get started, or accept an invitation you were sent.
          </EmptyDescription>
        </Empty>
        <CreateOrganizationCard />
      </div>
    );
  }

  const members = organization.data.members ?? [];
  const viewerRole =
    members.find((member) => member.userId === session.user.id)?.role ?? "";
  // Cosmetic — the server's `invitation: create` check is what enforces.
  const canInvite = hasPermission({
    permissions: { invitation: ["create"] },
    role: viewerRole,
  });

  return (
    <div className="space-y-6">
      <MembersCard canInvite={canInvite} members={members} />
      {canInvite ? (
        <>
          <InvitationsCard
            invitations={organization.data.invitations ?? []}
            organizationId={organization.data.id}
          />
          <InviteForm organizationId={organization.data.id} />
        </>
      ) : null}
      <CreateOrganizationCard />
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/organization")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Organization" }] }),
});
