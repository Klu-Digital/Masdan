"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import {
  ChevronRightIcon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export const Breadcrumb = ({
  ...props
}: React.ComponentProps<"nav">): React.ReactElement => (
  <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />
);

export const BreadcrumbList = ({
  className,
  ...props
}: React.ComponentProps<"ol">): React.ReactElement => (
  <ol
    className={cn(
      "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm wrap-break-word sm:gap-2.5",
      className
    )}
    data-slot="breadcrumb-list"
    {...props}
  />
);

export const BreadcrumbItem = ({
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement => (
  <li
    className={cn("inline-flex items-center gap-1.5", className)}
    data-slot="breadcrumb-item"
    {...props}
  />
);

export const BreadcrumbLink = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"a">): React.ReactElement => {
  const defaultProps = {
    className: cn("hover:text-foreground text-sm transition-colors", className),
    "data-slot": "breadcrumb-link",
  };

  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(defaultProps, props),
    render,
  });
};

export const BreadcrumbPage = ({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement => (
  <span
    aria-current="page"
    className={cn("text-foreground truncate text-sm font-semibold", className)}
    data-slot="breadcrumb-page"
    {...props}
  />
);

export const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentProps<"li">): React.ReactElement => (
  <li
    aria-hidden="true"
    className={cn("opacity-80 [&>svg]:size-4", className)}
    data-slot="breadcrumb-separator"
    role="presentation"
    {...props}
  >
    {children ?? <HugeiconsIcon icon={ChevronRightIcon} strokeWidth={2} />}
  </li>
);

export const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">): React.ReactElement => (
  <span
    aria-hidden="true"
    className={className}
    data-slot="breadcrumb-ellipsis"
    role="presentation"
    {...props}
  >
    <HugeiconsIcon
      icon={MoreHorizontalIcon}
      strokeWidth={2}
      className="size-4"
    />
    <span className="sr-only">More</span>
  </span>
);
