import { Button } from "@masdan/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@masdan/ui/components/field";
import { Input } from "@masdan/ui/components/input";
import { toastManager } from "@masdan/ui/components/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { invalidateSession } from "@/lib/session";

import { DEMO_EMAIL, DEMO_PASSWORD } from "./auth-client";

/** The real form's layout with the demo account filled in and locked. */
const SignInForm = ({ redirectTo }: { redirectTo: string }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    await authClient.signIn.email(
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      {
        onError: (error) => {
          setPending(false);
          toastManager.add({
            title: error.error.message || error.error.statusText,
            type: "error",
          });
        },
        onSuccess: async () => {
          await invalidateSession(queryClient);
          await navigate({ href: redirectTo });
        },
      }
    );
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        signIn();
      }}
    >
      <Field name="email">
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          autoComplete="off"
          disabled
          id="email"
          name="email"
          readOnly
          type="email"
          value={DEMO_EMAIL}
        />
      </Field>
      <Field name="password">
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          autoComplete="off"
          disabled
          id="password"
          name="password"
          readOnly
          type="password"
          value={DEMO_PASSWORD}
        />
        <FieldDescription>
          This is a demo account. Your changes stay in this tab and reset when
          you reload or sign out.
        </FieldDescription>
      </Field>
      <Button className="w-full" loading={pending} size="lg" type="submit">
        Sign in to the demo
      </Button>
    </form>
  );
};

export default SignInForm;
