import { Button } from "@masdan/ui/components/button";
import { Field, FieldError, FieldLabel } from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { toastManager } from "@masdan/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

const SignUpForm = ({ redirectTo }: { redirectTo: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      email: "",
      name: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          name: value.name,
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
            // See sign-in-form: the guard at the destination reads the session
            // from this cache, so it has to be refreshed before we navigate.
            await invalidateSession(queryClient);
            await navigate({ href: redirectTo });
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        name: z.string().min(2, "Name must be at least 2 characters"),
        password: z.string().min(8, "Password must be at least 8 characters"),
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
      <form.Field name="name">
        {(field) => (
          <Field name={field.name}>
            <FieldLabel htmlFor={field.name}>Name</FieldLabel>
            <Input
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              autoComplete="name"
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
            <FieldLabel htmlFor={field.name}>Password</FieldLabel>
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
            Create Account
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
};

export default SignUpForm;
