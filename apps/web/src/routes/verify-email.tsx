import { Button } from "@masdan/ui/components/button";
import { Spinner } from "@masdan/ui/components/spinner";
import { toastManager } from "@masdan/ui/components/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";

import AuthShell from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { asOptionalString } from "@/lib/redirect";
import { invalidateSession } from "@/lib/session";

// `getRouteApi` rather than `Route.*` so the components below do not have to
// reference `Route`, which is declared at the bottom of the file.
const routeApi = getRouteApi("/verify-email");

const VerifyToken = ({ token }: { token: string }) => {
  const queryClient = useQueryClient();

  const verification = useQuery({
    meta: { suppressErrorToast: true },
    queryFn: async () => {
      const { error } = await authClient.verifyEmail({ query: { token } });
      if (error) {
        throw new Error(error.message ?? "This link is no longer valid");
      }
      // Verification flips `user.emailVerified`, which the session carries.
      await invalidateSession(queryClient);
      return true;
    },
    queryKey: ["verify-email", token],
    // A verification token is single-use: a retry would consume an already-spent
    // token and report a failure that never happened.
    retry: false,
  });

  if (verification.isPending) {
    return (
      <AuthShell title="Verifying your email">
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthShell>
    );
  }

  if (verification.isError) {
    return (
      <AuthShell
        description="This verification link is invalid or has already been used. Sign in and we can send you a fresh one."
        title="Couldn't verify that link"
      >
        <Link to="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="Thanks — your email address is confirmed."
      title="Email verified"
    >
      <Link to="/dashboard">
        <Button className="w-full">Continue to the app</Button>
      </Link>
    </AuthShell>
  );
};

const AwaitingVerification = ({ email }: { email: string | null }) => {
  const resend = useMutation({
    mutationFn: async (address: string) => {
      const { error } = await authClient.sendVerificationEmail({
        callbackURL: "/verify-email",
        email: address,
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

  if (!email) {
    return (
      <AuthShell
        description="Open the link from your verification email, or sign in to request a new one."
        title="Verify your email"
      >
        <Link to="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={`We sent a verification link to ${email}. It may take a minute to arrive.`}
      title="Verify your email"
    >
      <Button
        className="w-full"
        loading={resend.isPending}
        onClick={() => resend.mutate(email)}
        variant="outline"
      >
        Resend verification email
      </Button>
    </AuthShell>
  );
};

const RouteComponent = () => {
  const { token } = routeApi.useSearch();
  const { session } = routeApi.useRouteContext();

  if (token) {
    return <VerifyToken token={token} />;
  }

  return <AwaitingVerification email={session?.user.email ?? null} />;
};

/** Token route: no guard either way. See `/login` for why. */
export const Route = createFileRoute("/verify-email")({
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Verify email" }] }),
  validateSearch: (search: { token?: string } & SearchSchemaInput) => ({
    token: asOptionalString(search.token),
  }),
});
