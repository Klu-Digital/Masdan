import { createFileRoute } from "@tanstack/react-router";

// The ledger itself lives in the parent layout; the index adds nothing.
export const Route = createFileRoute("/_auth/transactions/")({
  component: () => null,
});
