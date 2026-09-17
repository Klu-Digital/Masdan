import { Button } from "@k22i/ui/components/button";
import { Field, FieldError, FieldLabel } from "@k22i/ui/components/field";
import { Input } from "@k22i/ui/components/input";
import { toastManager } from "@k22i/ui/components/toast";
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
      className="space-y-4"
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

  // better-auth validates the token server-side first; an expired one arrives
  // as `?error=` with no token.
  if (!token) {
    return (
      <AuthShell
        description="This reset link is invalid or has expired. Reset links can only be used once."
        footer={
          <Link
            className="text-foreground underline underline-offset-4"
            to="/login"
          >
            Back to sign in
          </Link>
        }
        title="Link no longer valid"
      >
        <Link to="/forgot-password">
          <Button className="w-full">Request a new link</Button>
        </Link>
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
