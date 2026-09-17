import {
  Link,
  createFileRoute,
  getRouteApi,
  redirect,
} from "@tanstack/react-router";

import AuthShell from "@/components/auth-shell";
import SignInForm from "@/components/sign-in-form";
import { redirectSearch, safeRedirect } from "@/lib/redirect";

// `getRouteApi` rather than `Route.useSearch()` so the component does not have
// to reference `Route`, which is declared below it.
const routeApi = getRouteApi("/login");

const RouteComponent = () => {
  const { redirect: requested } = routeApi.useSearch();

  return (
    <AuthShell
      description="Sign in to continue."
      footer={
        <>
          Need an account?{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            search={{ redirect: requested }}
            to="/signup"
          >
            Sign up
          </Link>
        </>
      }
      title="Welcome back"
    >
      <SignInForm
        redirectTo={safeRedirect(requested, window.location.origin)}
      />
    </AuthShell>
  );
};

export const Route = createFileRoute("/login")({
  /**
   * The "already signed in" bounce belongs to this route and `/signup` only.
   * `/reset-password`, `/verify-email` and `/accept-invite` carry a token an
   * authenticated visitor may act on, so a shared guard would drop an invite on
   * the floor.
   */
  beforeLoad: ({ context, search }) => {
    if (context.session) {
      throw redirect({
        href: safeRedirect(search.redirect, window.location.origin),
      });
    }
  },
  component: RouteComponent,
  head: () => ({ meta: [{ title: "Sign in" }] }),
  validateSearch: redirectSearch,
});
