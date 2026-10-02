import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const Empty = ({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & {
  /** `compact` for empty sections inside a page; `default` for a whole page. */
  size?: "default" | "compact";
}): React.ReactElement => (
  <div
    className={cn(
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center text-balance",
      size === "default" ? "py-14 md:py-20" : "py-10 md:py-12",
      className
    )}
    data-slot="empty"
    {...props}
  />
);

export const EmptyHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex max-w-sm flex-col items-center text-center", className)}
    data-slot="empty-header"
    {...props}
  />
);

export const EmptyMedia = ({
  className,
  variant = "icon",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "icon";
}): React.ReactElement => (
  <div
    className={cn(
      "mb-4 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
      variant === "icon" &&
        "bg-secondary text-muted-foreground size-12 rounded-2xl [&_svg:not([class*='size-'])]:size-6",
      className
    )}
    data-slot="empty-media"
    data-variant={variant}
    {...props}
  />
);

export const EmptyTitle = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("text-base font-semibold", className)}
    data-slot="empty-title"
    {...props}
  />
);

export const EmptyDescription = ({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement => (
  <div
    className={cn(
      "text-muted-foreground [&>a]:text-brand-text max-w-xs text-sm [&>a]:underline-offset-4 [&>a:hover]:underline [[data-slot=empty-title]+&]:mt-1",
      className
    )}
    data-slot="empty-description"
    {...props}
  />
);

export const EmptyContent = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "flex w-full max-w-sm min-w-0 flex-col items-center gap-3 text-sm text-balance",
      className
    )}
    data-slot="empty-content"
    {...props}
  />
);
