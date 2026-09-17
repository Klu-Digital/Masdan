import { Button } from "@k22i/ui/components/button";
import { Field, FieldError, FieldLabel } from "@k22i/ui/components/field";
import { Input } from "@k22i/ui/components/input";
import { toastManager } from "@k22i/ui/components/toast";
import { useForm } from "@tanstack/react-form";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import AuthShell from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

const RouteComponent = () => {
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        // Where better-auth sends the recipient once it has validated the token.
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        // better-auth answers success for an unknown address on purpose, so an
        // error here is server-side config.
        toastManager.add({
          title: error.message ?? "Could not start a password reset",
          type: "error",
        });
        return;
      }

      setSent(true);
    },
    validators: {
      onSubmit: z.object({ email: z.email("Invalid email address") }),
    },
  });

  if (sent) {
    return (
      <AuthShell
        description="If an account exists for that address, a reset link is on its way. The link expires in one hour."
        footer={
          <Link
            className="text-foreground underline underline-offset-4"
            to="/login"
          >
            Back to sign in
          </Link>
        }
        title="Check your email"
      >
        <Button
          className="w-full"
          onClick={() => setSent(false)}
          variant="outline"
        >
          Use a different address
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="We'll email you a link to set a new one."
      footer={
        <Link
          className="text-foreground underline underline-offset-4"
          to="/login"
        >
          Back to sign in
        </Link>
      }
      title="Forgot your password?"
    >
      <form
        className="space-y-4"
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
              Send reset link
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthShell>
  );
};

/**
 * No guard either way: someone signed in on this device may be resetting a
 * different account's password.
 */
export const Route = createFileRoute("/forgot-password")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Forgot password" }] }),
});
