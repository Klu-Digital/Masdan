import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListSection,
  ListSectionFooter,
  ListSectionHeader,
} from "@masdan/ui/components/list";
import { Tabs, TabsList, TabsTab } from "@masdan/ui/components/tabs";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import { UserAvatar } from "@/components/shell/user-avatar";
import { useTheme } from "@/components/theme-provider";
import { authClient } from "@/lib/auth-client";
import { avatarDataUrl } from "@/lib/avatar";
import { invalidateSession } from "@/lib/session";

const routeApi = getRouteApi("/_auth/settings/");

const MIN_NAME_LENGTH = 2;

const ProfilePhoto = ({
  image,
  name,
}: {
  image: string | null | undefined;
  name: string;
}) => {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState<"change" | "remove" | null>(null);

  const save = async (next: string | null, action: "change" | "remove") => {
    setSaving(action);
    const { error } = await authClient.updateUser({ image: next });
    if (error) {
      setSaving(null);
      toastManager.add({
        title: error.message ?? "Could not save your photo",
        type: "error",
      });
      return;
    }
    await invalidateSession(queryClient);
    setSaving(null);
    toastManager.add({
      title: next ? "Photo updated" : "Photo removed",
      type: "success",
    });
  };

  const choose = async (photo: File | undefined) => {
    if (!photo) {
      return;
    }
    try {
      await save(await avatarDataUrl(photo), "change");
    } catch (error) {
      toastManager.add({
        title:
          error instanceof Error ? error.message : "Could not read that photo",
        type: "error",
      });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <UserAvatar image={image} name={name} size="xl" />
      <div className="flex gap-2">
        <input
          accept="image/*"
          className="sr-only"
          onChange={(event) => {
            const [photo] = event.target.files ?? [];
            // Cleared so choosing the same file again still fires `change`.
            event.target.value = "";
            choose(photo);
          }}
          ref={input}
          tabIndex={-1}
          type="file"
        />
        <Button
          loading={saving === "change"}
          disabled={saving !== null}
          onClick={() => input.current?.click()}
          size="sm"
          variant="secondary"
        >
          {image ? "Change photo" : "Add photo"}
        </Button>
        {image ? (
          <Button
            loading={saving === "remove"}
            disabled={saving !== null}
            onClick={() => save(null, "remove")}
            size="sm"
            variant="ghost"
          >
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
};

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xl font-semibold">
          {session.user.name}
        </span>
        <span className="text-muted-foreground truncate text-sm">
          {session.user.email}
        </span>
      </div>

      <ListSection>
        <ListSectionHeader>Photo</ListSectionHeader>
        <div className="bg-card dark:ring-hairline rounded-2xl p-4 dark:ring-1">
          <ProfilePhoto image={session.user.image} name={session.user.name} />
        </div>
        <ListSectionFooter>
          Shown beside the transactions you add. Cropped to a square.
        </ListSectionFooter>
      </ListSection>

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
              <ListItemDescription>Used to sign in.</ListItemDescription>
            </ListItemContent>
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
