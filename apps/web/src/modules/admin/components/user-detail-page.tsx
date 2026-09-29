import {
  AlertDialog,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@masdan/ui/components/alert-dialog";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@masdan/ui/components/card";
import { Field, FieldLabel } from "@masdan/ui/components/field";
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
import { Textarea } from "@masdan/ui/components/textarea";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, getRouteApi, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { invalidateSession } from "@/lib/session";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/_auth/admin/users/$userId");

const GLOBAL_ROLE_OPTIONS = [
  { label: "User", value: "user" },
  { label: "Admin", value: "admin" },
] as const;

const BAN_DURATION_OPTIONS = [
  { label: "1 hour", value: String(60 * 60) },
  { label: "1 day", value: String(60 * 60 * 24) },
  { label: "7 days", value: String(60 * 60 * 24 * 7) },
  { label: "30 days", value: String(60 * 60 * 24 * 30) },
  { label: "Permanent", value: "permanent" },
] as const;

const RoleCard = ({
  currentRole,
  userId,
}: {
  currentRole: string | null;
  userId: string;
}) => {
  const [role, setRole] = useState(currentRole ?? "user");
  const queryClient = useQueryClient();

  const setRoleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.admin.setRole({
        role: role as "admin" | "user",
        userId,
      });
      if (error) {
        throw new Error(error.message ?? "Could not set the role");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.users.detail.key(),
      });
      toastManager.add({ title: "Role updated", type: "success" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global role</CardTitle>
      </CardHeader>
      <CardPanel>
        <Select
          items={GLOBAL_ROLE_OPTIONS}
          onValueChange={(value) => setRole(value as string)}
          value={role}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {GLOBAL_ROLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </CardPanel>
      <CardFooter>
        <Button
          disabled={role === (currentRole ?? "user")}
          loading={setRoleMutation.isPending}
          onClick={() => setRoleMutation.mutate()}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
};

const BanCard = ({
  banExpires,
  banned,
  banReason,
  userId,
}: {
  banExpires: Date | null;
  banned: boolean;
  banReason: string | null;
  userId: string;
}) => {
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<string>(
    BAN_DURATION_OPTIONS[1].value
  );
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: orpc.admin.users.detail.key() });

  const ban = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.admin.banUser({
        banReason: reason || undefined,
        ...(duration === "permanent" ? {} : { banExpiresIn: Number(duration) }),
        userId,
      });
      if (error) {
        throw new Error(error.message ?? "Could not ban this user");
      }
    },
    onSuccess: async () => {
      await invalidate();
      toastManager.add({ title: "User banned", type: "success" });
    },
  });

  const unban = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.admin.unbanUser({ userId });
      if (error) {
        throw new Error(error.message ?? "Could not unban this user");
      }
    },
    onSuccess: async () => {
      await invalidate();
      toastManager.add({ title: "User unbanned", type: "success" });
    },
  });

  if (banned) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              Ban <Badge variant="error">banned</Badge>
            </span>
          </CardTitle>
          <CardDescription>
            {banReason ?? "No reason given."}{" "}
            {banExpires
              ? `Expires ${formatDateTime(banExpires)}.`
              : "No expiry — permanent."}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button loading={unban.isPending} onClick={() => unban.mutate()}>
            Unban
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ban this user</CardTitle>
      </CardHeader>
      <CardPanel>
        <div className="space-y-4">
          <Field name="reason">
            <FieldLabel htmlFor="ban-reason">Reason</FieldLabel>
            <Textarea
              id="ban-reason"
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              value={reason}
            />
          </Field>
          <Field name="duration">
            <FieldLabel>Duration</FieldLabel>
            <Select
              items={BAN_DURATION_OPTIONS}
              onValueChange={(value) => setDuration(value as string)}
              value={duration}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {BAN_DURATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
        </div>
      </CardPanel>
      <CardFooter>
        <Button
          loading={ban.isPending}
          onClick={() => ban.mutate()}
          variant="destructive"
        >
          Ban user
        </Button>
      </CardFooter>
    </Card>
  );
};

const SessionsCard = ({
  sessions,
  userId,
}: {
  sessions: {
    createdAt: Date;
    expiresAt: Date;
    id: string;
    impersonatedBy: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }[];
  userId: string;
}) => {
  const queryClient = useQueryClient();

  const revokeAll = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.admin.revokeUserSessions({ userId });
      if (error) {
        throw new Error(error.message ?? "Could not revoke sessions");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.users.detail.key(),
      });
      toastManager.add({ title: "Sessions revoked", type: "success" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
      </CardHeader>
      <CardPanel>
        {sessions.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>
                    <span className="text-xs">{session.ipAddress ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {formatDateTime(session.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {formatDateTime(session.expiresAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">No active sessions.</p>
        )}
      </CardPanel>
      {sessions.length > 0 ? (
        <CardFooter>
          <Button
            loading={revokeAll.isPending}
            onClick={() => revokeAll.mutate()}
            variant="outline"
          >
            Revoke all sessions
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
};

/** Masdan sends no email: the admin hands this link over themselves. */
const PasswordCard = ({ userId }: { userId: string }) => {
  const issue = useMutation({
    mutationFn: () => orpc.admin.users.issuePasswordReset.call({ userId }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Create a one-time reset link and hand it over yourself. It works once,
          expires in 24 hours, and setting the new password signs the user out
          everywhere.
        </CardDescription>
      </CardHeader>
      {issue.data ? (
        <CardPanel>
          <Field>
            <FieldLabel htmlFor="reset-link">
              Reset link, shown only now
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="reset-link"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={issue.data.url}
              />
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(issue.data.url);
                  toastManager.add({ title: "Link copied", type: "success" });
                }}
                variant="outline"
              >
                Copy
              </Button>
            </div>
          </Field>
        </CardPanel>
      ) : null}
      <CardFooter>
        <Button
          loading={issue.isPending}
          onClick={() => issue.mutate()}
          variant="outline"
        >
          {issue.data ? "Create another link" : "Create reset link"}
        </Button>
      </CardFooter>
    </Card>
  );
};

const DangerZone = ({
  userEmail,
  userId,
}: {
  userEmail: string;
  userId: string;
}) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmEmail, setConfirmEmail] = useState("");

  const impersonate = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.admin.impersonateUser({ userId });
      if (error) {
        throw new Error(error.message ?? "Could not impersonate this user");
      }
    },
    onSuccess: async () => {
      await invalidateSession(queryClient);
      await router.navigate({ to: "/dashboard" });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.admin.removeUser({ userId });
      if (error) {
        throw new Error(error.message ?? "Could not remove this user");
      }
    },
    onSuccess: async () => {
      toastManager.add({ title: "User removed", type: "success" });
      await router.navigate({ to: "/admin/users" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
      </CardHeader>
      <CardFooter className="justify-between">
        <Button
          loading={impersonate.isPending}
          onClick={() => impersonate.mutate()}
          variant="outline"
        >
          Impersonate
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            Remove user
          </AlertDialogTrigger>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {userEmail}?</AlertDialogTitle>
              <p className="text-muted-foreground text-sm">
                This deletes the account and cascades to their sessions,
                memberships and files. Type the email to confirm.
              </p>
            </AlertDialogHeader>
            <div className="px-6">
              <Input
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={userEmail}
                value={confirmEmail}
              />
            </div>
            <AlertDialogFooter>
              <Button
                disabled={confirmEmail !== userEmail}
                loading={remove.isPending}
                onClick={() => remove.mutate()}
                variant="destructive"
              >
                Delete permanently
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
};

export const AdminUserDetailPage = () => {
  const { userId } = routeApi.useParams();
  const detail = useQuery(
    orpc.admin.users.detail.queryOptions({ input: { userId } })
  );

  if (detail.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!detail.data?.user) {
    return <p className="text-muted-foreground text-sm">User not found.</p>;
  }

  const { user, memberships, sessions, fileUsage } = detail.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <p className="text-muted-foreground text-sm">{user.email}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RoleCard currentRole={user.role} userId={user.id} />
        <BanCard
          banExpires={user.banExpires ?? null}
          banned={Boolean(user.banned)}
          banReason={user.banReason ?? null}
          userId={user.id}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organization memberships</CardTitle>
        </CardHeader>
        <CardPanel>
          {memberships.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((membership) => (
                  <TableRow key={membership.id}>
                    <TableCell>
                      <Link
                        className="hover:underline"
                        params={{
                          organizationId: membership.organizationId,
                        }}
                        to="/admin/organizations/$organizationId"
                      >
                        {membership.organizationName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{membership.role}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">
              Not a member of any organization.
            </p>
          )}
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File usage</CardTitle>
        </CardHeader>
        <CardPanel>
          <p className="text-sm">
            {fileUsage.count} file{fileUsage.count === 1 ? "" : "s"},{" "}
            {formatBytes(fileUsage.totalBytes)}
          </p>
        </CardPanel>
      </Card>

      <SessionsCard sessions={sessions} userId={user.id} />

      <PasswordCard userId={user.id} />

      <DangerZone userEmail={user.email} userId={user.id} />
    </div>
  );
};
