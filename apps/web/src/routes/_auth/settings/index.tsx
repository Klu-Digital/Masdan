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
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

const routeApi = getRouteApi("/_auth/settings/");

const MIN_NAME_LENGTH = 2;

const RouteComponent = () => {
  const { session } = routeApi.useRouteContext();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: { name: session.user.name },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({ name: value.name });
      if (error) {
        toastManager.add({
          title: error.message ?? "Could not save your profile",
          type: "error",
        });
        return;
      }
      // The session renders the name, so its cached copy has to be refreshed.
      await invalidateSession(queryClient);
      toastManager.add({ title: "Profile updated", type: "success" });
    },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .min(
            MIN_NAME_LENGTH,
            `Name must be at least ${MIN_NAME_LENGTH} characters`
          ),
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
      toastManager.add({ title: "Verification email sent", type: "success" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How you appear across the app.</CardDescription>
        </CardHeader>
        <CardPanel>
          <form
            className="max-w-sm space-y-4"
            id="profile-form"
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
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
          </form>
        </CardPanel>
        <CardFooter>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <Button
                disabled={!canSubmit}
                form="profile-form"
                loading={isSubmitting}
                type="submit"
              >
                Save
              </Button>
            )}
          </form.Subscribe>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Used to sign in and to receive organization invitations.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <div className="flex items-center gap-2">
            <span className="text-sm">{session.user.email}</span>
            <Badge variant={session.user.emailVerified ? "default" : "outline"}>
              {session.user.emailVerified ? "Verified" : "Unverified"}
            </Badge>
          </div>
        </CardPanel>
        {session.user.emailVerified ? null : (
          <CardFooter>
            <Button
              loading={resendVerification.isPending}
              onClick={() => resendVerification.mutate()}
              variant="outline"
            >
              Send verification email
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Profile" }] }),
});
