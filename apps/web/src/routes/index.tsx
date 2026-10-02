import { createFileRoute, redirect } from "@tanstack/react-router";

// In `beforeLoad` so the browser never paints an empty shell.
export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: context.session ? "/dashboard" : "/login" });
  },
});
