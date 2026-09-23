import { hasPermission } from "@masdan/auth/permissions";
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
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
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
import { currenciesQueryOptions } from "@/modules/currency/queries";
import { HouseholdFinanceCard } from "@/modules/household/components/household-finance-card";
import { householdProfileQueryOptions } from "@/modules/household/queries";

const routeApi = getRouteApi("/_auth/settings/household");

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
      <CardTitle>Household members</CardTitle>
      <CardDescription>Everyone with access to this household.</CardDescription>
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
          Your role does not allow inviting people to this household.
        </p>
      )}
    </CardPanel>
  </Card>
);

const InvitationsCard = ({
  invitations,
}: {
  invitations: { email: string; id: string; role: string; status: string }[];
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
      await invalidateOrganizations(queryClient);
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
          Recipients see invitations in the app after signing in. A link is
          available as an optional fallback.
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
                        Copy link (optional)
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
        role: value.role as "admin" | "member" | "viewer",
      });
      if (error) {
        toastManager.add({
          title: error.message ?? "Could not send the invitation",
          type: "error",
        });
        return;
      }
      await invalidateOrganizations(queryClient);
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
          They join this household, not the app as a whole.
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
          title: error?.message ?? "Could not create the household",
          type: "error",
        });
        return;
      }

      const { error: activationError } =
        await authClient.organization.setActive({
          organizationId: data.id,
        });
      if (activationError) {
        await invalidateOrganizations(queryClient);
        toastManager.add({
          title:
            activationError.message ??
            "Household created, but could not switch to it",
          type: "error",
        });
        return;
      }
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
        <CardTitle>New household</CardTitle>
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
  const householdProfile = useQuery(
    householdProfileQueryOptions(activeOrganizationId)
  );
  const currencies = useQuery(currenciesQueryOptions());

  if (organization.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!organization.data) {
    return (
      <div className="space-y-6">
        <Empty>
          <EmptyTitle>No active household</EmptyTitle>
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
  const canManage = hasPermission({
    permissions: { organization: ["update"] },
    role: viewerRole,
  });

  return (
    <div className="space-y-6">
      {householdProfile.isPending || currencies.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : null}
      {householdProfile.data && currencies.data ? (
        <HouseholdFinanceCard
          activeOrganizationId={organization.data.id}
          canManage={canManage}
          currencies={currencies.data}
          profile={householdProfile.data}
        />
      ) : null}
      {householdProfile.isError || currencies.isError ? (
        <p className="text-muted-foreground text-sm">
          Could not load household financial settings.
        </p>
      ) : null}
      <MembersCard canInvite={canInvite} members={members} />
      {canInvite ? (
        <>
          <InvitationsCard invitations={organization.data.invitations ?? []} />
          <InviteForm organizationId={organization.data.id} />
        </>
      ) : null}
      <CreateOrganizationCard />
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/household")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Household" }] }),
});
