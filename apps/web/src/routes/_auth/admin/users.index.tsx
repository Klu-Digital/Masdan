import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { Card, CardHeader, CardPanel } from "@masdan/ui/components/card";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@masdan/ui/components/dialog";
import { Empty, EmptyDescription, EmptyTitle } from "@masdan/ui/components/empty";
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
import type { UseQueryResult } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";

const PAGE_SIZE = 50;

interface ListedUser {
  banned?: boolean | null;
  emailVerified: boolean;
}

const userStatusBadge = (user: ListedUser) => {
  if (user.banned) {
    return <Badge variant="error">banned</Badge>;
  }
  if (user.emailVerified) {
    return <Badge variant="default">verified</Badge>;
  }
  return <Badge variant="outline">unverified</Badge>;
};

const GLOBAL_ROLE_OPTIONS = [
  { label: "User", value: "user" },
  { label: "Admin", value: "admin" },
] as const;

const CreateUserDialog = () => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const createUser = useMutation({
    mutationFn: async (value: {
      email: string;
      name: string;
      password: string;
      role: string;
    }) => {
      const { error } = await authClient.admin.createUser({
        email: value.email,
        name: value.name,
        password: value.password,
        role: value.role as "admin" | "user",
      });
      if (error) {
        throw new Error(error.message ?? "Could not create the user");
      }
    },
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toastManager.add({ title: "User created", type: "success" });
      setOpen(false);
    },
  });

  const form = useForm({
    defaultValues: { email: "", name: "", password: "", role: "user" },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createUser.mutateAsync(value);
        formApi.reset();
      } catch {
        // Surfaced to the user via the mutation's own `onError` toast.
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email(),
        name: z.string().min(1),
        password: z.string().min(8, "At least 8 characters"),
        role: z.string(),
      }),
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button>New user</Button>} />
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 px-6 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  onChange={(e) => field.handleChange(e.target.value)}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  id={field.name}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="email"
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <Field name={field.name}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  id={field.name}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="password"
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
              <Field name={field.name}>
                <FieldLabel>Global role</FieldLabel>
                <Select
                  items={GLOBAL_ROLE_OPTIONS}
                  onValueChange={(value) => field.handleChange(value as string)}
                  value={field.state.value}
                >
                  <SelectTrigger>
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
              </Field>
            )}
          </form.Field>
          <DialogFooter variant="bare">
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ canSubmit, isSubmitting }) => (
                <Button
                  disabled={!canSubmit}
                  loading={isSubmitting || createUser.isPending}
                  type="submit"
                >
                  Create
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
};

/**
 * Spelled out by hand: better-auth's client infers the array element as `any`.
 */
interface AdminListedUser {
  banned?: boolean | null;
  createdAt: string | Date;
  email: string;
  emailVerified: boolean;
  id: string;
  name: string;
  role?: string | null;
}

interface ListUsersResult {
  total: number;
  users: AdminListedUser[];
}

const UsersList = ({
  offset,
  setOffset,
  users,
}: {
  offset: number;
  setOffset: (offset: number) => void;
  users: UseQueryResult<ListUsersResult>;
}) => {
  if (users.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!users.data || users.data.users.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No users</EmptyTitle>
        <EmptyDescription>Nothing matches this search.</EmptyDescription>
      </Empty>
    );
  }

  const { total, users: rows } = users.data;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <Link
                  className="font-medium hover:underline"
                  params={{ userId: user.id }}
                  to="/admin/users/$userId"
                >
                  {user.name}
                </Link>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground text-xs">
                  {user.email}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{user.role ?? "user"}</Badge>
              </TableCell>
              <TableCell>{userStatusBadge(user)}</TableCell>
              <TableCell>
                <span className="text-xs">
                  {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-muted-foreground text-xs">{total} total</p>
        <div className="flex gap-2">
          <Button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </>
  );
};

const RouteComponent = () => {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");

  const users = useQuery({
    queryFn: async (): Promise<ListUsersResult> => {
      const { data, error } = await authClient.admin.listUsers({
        query: {
          limit: PAGE_SIZE,
          offset,
          ...(search
            ? { searchField: "email" as const, searchValue: search }
            : {}),
        },
      });
      if (error) {
        throw new Error(error.message ?? "Could not load users");
      }
      return data as ListUsersResult;
    },
    queryKey: ["admin", "users", "list", { offset, search }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Users</h1>
        <CreateUserDialog />
      </div>

      <Card>
        <CardHeader>
          <Input
            className="max-w-64"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search by email"
            value={search}
          />
        </CardHeader>
        <CardPanel>
          <UsersList offset={offset} setOffset={setOffset} users={users} />
        </CardPanel>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/admin/users/")({
  component: RouteComponent,
});
