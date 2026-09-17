import {
  Link,
  createFileRoute,
  getRouteApi,
  redirect,
} from "@tanstack/react-router";

import AuthShell from "@/components/auth-shell";
import SignUpForm from "@/components/sign-up-form";
import { redirectSearch, safeRedirect } from "@/lib/redirect";

const routeApi = getRouteApi("/signup");

const RouteComponent = () => {
  const { redirect: requested } = routeApi.useSearch();

  return (
    <AuthShell
      description="No credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            search={{ redirect: requested }}
            to="/login"
          >
            Sign in
          </Link>
        </>
      }
      title="Create your account"
    >
      <SignUpForm
        redirectTo={safeRedirect(requested, window.location.origin)}
      />
    </AuthShell>
  );
};

export const Route = createFileRoute("/signup")({
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      throw redirect({
        href: safeRedirect(search.redirect, window.location.origin),
      });
    }
  },
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Sign up" }] }),
  validateSearch: redirectSearch,
});
