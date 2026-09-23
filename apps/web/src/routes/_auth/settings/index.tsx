import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback } from "@masdan/ui/components/avatar";
import { Badge } from "@masdan/ui/components/badge";
import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListItemTrailing,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { initialsOf } from "@/components/shell/initials";
import { useTheme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

const routeApi = getRouteApi("/_auth/settings/");

const MIN_NAME_LENGTH = 2;

const ProfileSettings = () => {
  const { session } = routeApi.useRouteContext();
  const queryClient = useQueryClient();
  const { setTheme, theme } = useTheme();

  const form = useForm({
    defaultValues: { name: session.user.name },
    onSubmit: async ({ formApi, value }) => {
      const { error } = await authClient.updateUser({
        name: value.name.trim(),
      });
      if (error) {
        toastManager.add({
          title: error.message ?? "Could not save your name",
          type: "error",
        });
        return;
      }
      // The session renders the name, so its cached copy has to be refreshed.
      await invalidateSession(queryClient);
      formApi.reset({ name: value.name.trim() });
      toastManager.add({ title: "Name updated", type: "success" });
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .trim()
          .min(MIN_NAME_LENGTH, `Use at least ${MIN_NAME_LENGTH} characters`),
      }),
    },
  });

  const resendVerification = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.sendVerificationEmail({
        callbackURL: "/verify-email",
        email: session.user.email,
      });
      if (error) {
        throw new Error(error.message ?? "Could not send the email");
      }
    },
    onError: (error: Error) => {
      toastManager.add({ title: error.message, type: "error" });
    },
    onSuccess: () => {
      toastManager.add({
        description: `Check ${session.user.email}.`,
        title: "Verification email sent",
        type: "success",
      });
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Avatar size="xl">
          <AvatarFallback>{initialsOf(session.user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xl font-semibold">
            {session.user.name}
          </span>
          <span className="text-muted-foreground truncate text-sm">
            {session.user.email}
          </span>
        </div>
      </div>

      <ListSection>
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
                <FieldLabel className="sr-only" htmlFor={field.name}>
                  Name
                </FieldLabel>
                <Input
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  autoComplete="name"
                  id={field.name}
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
        <ListSectionFooter>
          How you appear to other members of your households.
        </ListSectionFooter>
      </ListSection>

      <ListSection>
        <ListSectionHeader>Email</ListSectionHeader>
        <List>
          <ListItem>
            <ListItemContent>
              <ListItemTitle>{session.user.email}</ListItemTitle>
              <ListItemDescription>
                Used to sign in and to receive household invitations.
              </ListItemDescription>
            </ListItemContent>
            <ListItemTrailing>
              {session.user.emailVerified ? (
                <Badge size="lg" variant="success">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
                  Verified
                </Badge>
              ) : (
                <Button
                  loading={resendVerification.isPending}
                  onClick={() => resendVerification.mutate()}
                  size="sm"
                  variant="tinted"
                >
                  Verify email
                </Button>
              )}
            </ListItemTrailing>
          </ListItem>
        </List>
      </ListSection>

      <ListSection>
        <ListSectionHeader>Appearance</ListSectionHeader>
        <Tabs
          onValueChange={(value) => setTheme(String(value))}
          value={theme ?? "system"}
        >
          <TabsList aria-label="Appearance" className="w-full sm:w-auto">
            <TabsTab value="light">Light</TabsTab>
            <TabsTab value="dark">Dark</TabsTab>
            <TabsTab value="system">Match system</TabsTab>
          </TabsList>
        </Tabs>
      </ListSection>
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/")({
  component: ProfileSettings,
  head: () => ({ meta: [{ title: "Profile" }] }),
});
