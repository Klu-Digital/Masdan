import {
  Cancel01Icon,
  Copy01Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { hasPermission } from "@masdan/auth/permissions";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemLeading,
  ListItemTitle,
  ListItemTrailing,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { Skeleton } from "@masdan/ui/components/skeleton";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";

import { HouseholdMark } from "@/components/shell/household-switcher";
import { UserAvatar } from "@/components/shell/user-avatar";
import { authClient } from "@/lib/auth-client";
import {
  activeOrganizationQueryOptions,
  invalidateOrganizations,
} from "@/lib/organization";
import { invalidateSession } from "@/lib/session";
import { ChatAppsSection } from "@/modules/chat/components/chat-apps-section";
import { DataExportSection } from "@/modules/exports/components/data-export-section";
import { HouseholdFinanceCard } from "@/modules/household/components/household-finance-card";
import { householdOrpc, orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/settings/household");

/** `owner` is deliberately absent: it transfers, it is not handed out. */
const INVITABLE_ROLES = [
  {
    description: "Can add and edit money, not archive it",
    label: "Member",
    value: "member",
  },
  {
    description: "Can manage everything, including people",
    label: "Admin",
    value: "admin",
  },
  { description: "Can look, not touch", label: "Viewer", value: "viewer" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  owner: "Owner",
  viewer: "Viewer",
};

const roleLabel = (role: string | null | undefined) =>
  role
    ?.split(",")
    .map((name) => ROLE_LABELS[name.trim()] ?? name.trim())
    .join(", ") ?? "Member";

const MIN_ORGANIZATION_NAME_LENGTH = 2;

const inviteLink = (invitationId: string) =>
  `${window.location.origin}/accept-invite?invitation=${invitationId}`;

const Members = ({
  currentUserId,
  members,
}: {
  currentUserId: string;
  members: {
    id: string;
    role: string;
    user: { email: string; image?: string | null; name: string };
    userId: string;
  }[];
}) => (
  <ListSection aria-label="Members">
    <ListSectionHeader>
      <span>Members</span>
      <span>{members.length}</span>
    </ListSectionHeader>
    <List>
      {members.map((member) => (
        <ListItem key={member.id}>
          <ListItemLeading>
            <UserAvatar
              image={member.user.image}
              name={member.user.name}
              size="lg"
            />
          </ListItemLeading>
          <ListItemContent>
            <ListItemTitle>
              {member.user.name}
              {member.userId === currentUserId ? (
                <span className="text-muted-foreground font-normal">(you)</span>
              ) : null}
            </ListItemTitle>
            <ListItemDescription>{member.user.email}</ListItemDescription>
          </ListItemContent>
          <ListItemTrailing>
            <Badge size="lg">{roleLabel(member.role)}</Badge>
          </ListItemTrailing>
        </ListItem>
      ))}
    </List>
  </ListSection>
);

const PendingInvitations = ({
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
    onSuccess: () => {
      toastManager.add({ title: "Invitation cancelled", type: "success" });
    },
  });
  const pending = invitations.filter(
    (invitation) => invitation.status === "pending"
  );
  if (pending.length === 0) {
    return null;
  }

  return (
    <ListSection aria-label="Pending invitations">
      <ListSectionHeader>Pending invitations</ListSectionHeader>
      <List>
        {pending.map((invitation) => (
          <ListItem key={invitation.id}>
            <ListItemContent>
              <ListItemTitle>{invitation.email}</ListItemTitle>
              <ListItemDescription>
                Invited as {roleLabel(invitation.role)}
              </ListItemDescription>
            </ListItemContent>
            <ListItemTrailing>
              <Menu>
                <MenuTrigger
                  aria-label={`Invitation for ${invitation.email}`}
                  render={<Button size="icon-sm" variant="ghost" />}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
                </MenuTrigger>
                <MenuPopup align="end" className="min-w-52">
                  <MenuItem
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        inviteLink(invitation.id)
                      );
                      toastManager.add({
                        title: "Invite link copied",
                        type: "success",
                      });
                    }}
                  >
                    <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
                    Copy invite link
                  </MenuItem>
                  <MenuItem
                    onClick={() => cancel.mutate(invitation.id)}
                    variant="destructive"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.8} />
                    Cancel invitation
                  </MenuItem>
                </MenuPopup>
              </Menu>
            </ListItemTrailing>
          </ListItem>
        ))}
      </List>
      <ListSectionFooter>
        Masdan sends no email: copy the invite link and send it yourself. Anyone
        holding it can join with that role until it expires or you cancel it.
      </ListSectionFooter>
    </ListSection>
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
          title: error.message ?? "Could not create the invitation",
          type: "error",
        });
        return;
      }
      await invalidateOrganizations(queryClient);
      form.reset();
      toastManager.add({
        description: "Copy its link from Pending invitations and send it.",
        title: `Invitation created for ${value.email}`,
        type: "success",
      });
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Enter a valid email address"),
        role: z.string(),
      }),
    },
  });

  return (
    <ListSection aria-label="Invite someone">
      <ListSectionHeader>Invite someone</ListSectionHeader>
      <form
        className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-end dark:ring-1"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <Field className="flex-1" name={field.name}>
              <FieldLabel htmlFor={field.name}>Email</FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                autoComplete="email"
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="name@example.com"
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
            <Field className="sm:w-36" name={field.name}>
              <FieldLabel>Role</FieldLabel>
              <Select
                items={INVITABLE_ROLES}
                onValueChange={(value) => field.handleChange(String(value))}
                value={field.state.value}
              >
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {INVITABLE_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <span className="flex flex-col">
                        <span>{role.label}</span>
                        <span className="text-muted-foreground text-xs">
                          {role.description}
                        </span>
                      </span>
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
            <Button disabled={!canSubmit} loading={isSubmitting} type="submit">
              Send invite
            </Button>
          )}
        </form.Subscribe>
      </form>
      <ListSectionFooter>
        They join this household only, not your other households.
      </ListSectionFooter>
    </ListSection>
  );
};

const HouseholdName = ({
  name,
  organizationId,
}: {
  name: string;
  organizationId: string;
}) => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const form = useForm({
    defaultValues: { name },
    onSubmit: async ({ formApi, value }) => {
      const trimmed = value.name.trim();
      const { error } = await authClient.organization.update({
        data: { name: trimmed },
        organizationId,
      });
      if (error) {
        toastManager.add({
          title: error.message ?? "Could not rename the household",
          type: "error",
        });
        return;
      }
      // The switcher and breadcrumbs read the name from these caches.
      await invalidateOrganizations(queryClient);
      await router.invalidate();
      formApi.reset({ name: trimmed });
      toastManager.add({ title: "Household renamed", type: "success" });
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .trim()
          .min(
            MIN_ORGANIZATION_NAME_LENGTH,
            `Use at least ${MIN_ORGANIZATION_NAME_LENGTH} characters`
          ),
      }),
    },
  });

  return (
    <ListSection aria-label="Household name">
      <ListSectionHeader>Name</ListSectionHeader>
      <form
        className="bg-card dark:ring-hairline flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-start dark:ring-1"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Field className="flex-1" name={field.name}>
              <FieldLabel className="sr-only" htmlFor="household-name">
                Household name
              </FieldLabel>
              <Input
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                id="household-name"
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
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
            isDirty: state.isDirty,
            isSubmitting: state.isSubmitting,
          })}
        >
          {({ canSubmit, isDirty, isSubmitting }) => (
            <Button
              disabled={!(canSubmit && isDirty)}
              loading={isSubmitting}
              type="submit"
            >
              Save
            </Button>
          )}
        </form.Subscribe>
      </form>
      <ListSectionFooter>Every member sees this name.</ListSectionFooter>
    </ListSection>
  );
};

const CreateHousehold = () => {
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
      await queryClient.invalidateQueries();
      await router.invalidate();
      form.reset();
      toastManager.add({ title: `Switched to ${data.name}`, type: "success" });
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .trim()
          .min(
            MIN_ORGANIZATION_NAME_LENGTH,
            `Use at least ${MIN_ORGANIZATION_NAME_LENGTH} characters`
          ),
      }),
    },
  });

  return (
    <ListSection aria-label="New household" id="new-household">
      <ListSectionHeader>New household</ListSectionHeader>
      <form
        className="bg-card dark:ring-hairline flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-end dark:ring-1"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
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
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="e.g. The Santos family"
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
              variant="secondary"
            >
              Create and switch
            </Button>
          )}
        </form.Subscribe>
      </form>
      <ListSectionFooter>
        Keep separate books — a business, a trip, a family member’s money.
      </ListSectionFooter>
    </ListSection>
  );
};

export const HouseholdSettingsPage = () => {
  const { activeOrganizationId, session } = routeApi.useRouteContext();
  const organization = useQuery(
    activeOrganizationQueryOptions(activeOrganizationId)
  );
  const householdProfile = useQuery(
    householdOrpc(activeOrganizationId).households.profile.queryOptions({
      enabled: activeOrganizationId !== null,
    })
  );
  const currencies = useQuery(
    orpc.currencies.list.queryOptions({ staleTime: Number.POSITIVE_INFINITY })
  );
  const hash = useRouterState({ select: (state) => state.location.hash });

  const loaded = !organization.isPending;
  useEffect(() => {
    // Wait for the form to exist before scrolling to it.
    if (loaded && hash === "new-household") {
      document
        .querySelector("#new-household")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [hash, loaded]);

  if (activeOrganizationId && organization.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-14 w-64" />
        <Skeleton className="h-40 w-full" radius="2xl" />
        <Skeleton className="h-56 w-full" radius="2xl" />
      </div>
    );
  }

  if (!organization.data) {
    return (
      <div className="flex flex-col gap-8">
        <Empty size="compact">
          <EmptyTitle>No active household</EmptyTitle>
          <EmptyDescription>
            Create one to get started, or accept an invitation you were sent.
          </EmptyDescription>
        </Empty>
        <CreateHousehold />
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
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <HouseholdMark name={organization.data.name} size="lg" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xl font-semibold">
            {organization.data.name}
          </span>
          <span className="text-muted-foreground text-sm">
            {members.length} {members.length === 1 ? "member" : "members"} ·
            you’re {roleLabel(viewerRole).toLowerCase()}
          </span>
        </div>
      </div>

      {canManage ? (
        <HouseholdName
          key={organization.data.id}
          name={organization.data.name}
          organizationId={organization.data.id}
        />
      ) : null}

      {householdProfile.isPending || currencies.isPending ? (
        <Skeleton className="h-40 w-full" radius="2xl" />
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
          Couldn’t load the household’s money defaults.
        </p>
      ) : null}

      <Members currentUserId={session.user.id} members={members} />
      {canInvite ? (
        <>
          <PendingInvitations
            invitations={organization.data.invitations ?? []}
          />
          <InviteForm organizationId={organization.data.id} />
        </>
      ) : (
        <p className="text-muted-foreground px-4 text-xs">
          Only owners and admins can invite people to this household.
        </p>
      )}
      <ChatAppsSection
        activeOrganizationId={organization.data.id}
        canLink={hasPermission({
          permissions: { transaction: ["create"] },
          role: viewerRole,
        })}
      />
      <DataExportSection
        householdName={organization.data.name}
        timeZone={
          householdProfile.data?.timezone ??
          new Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      />
      <CreateHousehold />
    </div>
  );
};
