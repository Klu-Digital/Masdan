import { Button } from "@masdan/ui/components/button";
import { Link } from "@tanstack/react-router";

import { failureKind } from "@/utils/orpc";
import type { FailureKind } from "@/utils/orpc";

const COPY: Record<FailureKind, { body: string; title: string }> = {
  forbidden: {
    body: "Ask a household admin if you need access.",
    title: "You don’t have access to this",
  },
  not_found: {
    body: "It may have been deleted, or belong to another household.",
    title: "We couldn’t find that",
  },
  unexpected: {
    body: "Try again in a moment. Nothing you entered has been lost.",
    title: "Something went wrong",
  },
  unreachable: {
    body: "Check your connection. Nothing you entered has been lost.",
    title: "Masdan can’t reach the server",
  },
};

export const RouteError = ({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) => {
  const kind = failureKind(error);
  const { body, title } = COPY[kind];
  const retryable = kind === "unreachable" || kind === "unexpected";

  return (
    <div className="animate-enter flex min-h-svh flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex max-w-sm flex-col gap-1.5">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      {retryable ? (
        <Button onClick={reset}>Try again</Button>
      ) : (
        <Button render={<Link to="/dashboard" />}>Back to dashboard</Button>
      )}
    </div>
  );
};
