import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import type { SearchSchemaInput } from "@tanstack/react-router";
import {
  Link,
  createFileRoute,
  getRouteApi,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";

import AuthShell from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { asOptionalString } from "@/lib/redirect";

// `getRouteApi` rather than `Route.useSearch()` so the component does not have
// to reference `Route`, which is declared below it.
const routeApi = getRouteApi("/reset-password");

const MIN_PASSWORD_LENGTH = 8;

const ResetForm = ({ token }: { token: string }) => {
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: { confirmPassword: "", password: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });

      if (error) {
        toastManager.add({
          title: error.message ?? "Could not reset your password",
          type: "error",
        });
        return;
      }

      toastManager.add({
        title: "Password updated — sign in with your new one",
        type: "success",
      });
      // A reset does not sign anyone in; the next step is the login form.
      await navigate({ to: "/login" });
    },
    validators: {
      onSubmit: z
        .object({
          confirmPassword: z.string(),
          password: z
            .string()
            .min(
              MIN_PASSWORD_LENGTH,
              `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
            ),
        })
        .refine((value) => value.password === value.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Field name="password">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>New password</FieldLabel>
            <Input
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              autoComplete="new-password"
              id={field.name}
              name={field.name}
              onBlur={field.handleBlur}
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

      <form.Field name="confirmPassword">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
            <Input
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              autoComplete="new-password"
              id={field.name}
              name={field.name}
              onBlur={field.handleBlur}
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

      <form.Subscribe
        selector={(state) => ({
          canSubmit: state.canSubmit,
          isSubmitting: state.isSubmitting,
        })}
      >
        {({ canSubmit, isSubmitting }) => (
          <Button
            className="w-full"
            size="lg"
            disabled={!canSubmit}
            loading={isSubmitting}
            type="submit"
          >
            Set new password
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};

const RouteComponent = () => {
  const { token } = routeApi.useSearch();

  // Links point straight here; an expired token only fails on submit.
  if (!token) {
    return (
      <AuthShell
        description="This reset link is invalid or has expired, and each one works once. Ask whoever runs your Masdan for a new one."
        footer={
          <Link
            className="text-brand-text font-medium underline-offset-4 hover:underline"
            to="/login"
          >
            Back to sign in
          </Link>
        }
        title="Link no longer valid"
      >
        <Button
          className="w-full"
          render={<Link to="/forgot-password" />}
          size="lg"
        >
          Request a new link
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="Choose something you haven't used here before."
      title="Set a new password"
    >
      <ResetForm token={token} />
    </AuthShell>
  );
};

/** Token route: no guard either way. See `/login` for why. */
export const Route = createFileRoute("/reset-password")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Reset password" }] }),
  validateSearch: (
    search: { error?: string; token?: string } & SearchSchemaInput
  ) => ({
    error: asOptionalString(search.error),
    token: asOptionalString(search.token),
  }),
});
