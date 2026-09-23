import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

const SignInForm = ({ redirectTo }: { redirectTo: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onError: (error) => {
            toastManager.add({
              title: error.error.message || error.error.statusText,
              type: "error",
            });
          },
          onSuccess: async () => {
            // Await the invalidation before navigating: the destination's guard
            // reads the session from this cache.
            await invalidateSession(queryClient);
            // `href`, not `to`: the destination came from `?redirect=`, already
            // narrowed by `safeRedirect`.
            await navigate({ href: redirectTo });
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
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
      <form.Field name="email">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Email</FieldLabel>
            <Input
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              autoComplete="email"
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

      <form.Field name="password">
        {(field) => (
          <Field name={field.name}>
            <div className="flex w-full items-center justify-between gap-2">
              <FieldLabel htmlFor={field.name}>Password</FieldLabel>
              <Link
                className="text-brand-text text-xs font-medium underline-offset-4 hover:underline"
                to="/forgot-password"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              autoComplete="current-password"
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
            Sign in
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};

export default SignInForm;
