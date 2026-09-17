import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/` is a signpost, not a page. Done in `beforeLoad` rather than an effect so
 * the browser never paints an empty shell first.
 */
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.session ? "/dashboard" : "/login" });
  },
});
