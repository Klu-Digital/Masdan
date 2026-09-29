import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { cn } from "@masdan/ui/lib/utils";
import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";

const SeeAllAnchor = ({
  children,
  className,
  ...props
}: ComponentProps<"a">) => (
  <a
    className={cn(
      "text-brand-text hover:bg-brand-soft focus-visible:ring-ring/50 -me-2 inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md px-2 text-xs font-medium outline-none focus-visible:ring-3",
      className
    )}
    {...props}
  >
    {children}
    <HugeiconsIcon
      aria-hidden="true"
      className="size-3.5"
      icon={ArrowRight01Icon}
      strokeWidth={2}
    />
  </a>
);

export const SeeAll = createLink(SeeAllAnchor);

export const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <div className="bg-card dark:ring-hairline flex items-center justify-between gap-3 rounded-2xl px-4 py-3 dark:ring-1">
    <p className="text-muted-foreground text-sm">Couldn’t load this.</p>
    <Button onClick={onRetry} size="sm" variant="secondary">
      Try again
    </Button>
  </div>
);
