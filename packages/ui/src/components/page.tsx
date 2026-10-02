import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const Page = ({
  className,
  width = "wide",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  width?: "wide" | "narrow" | "full";
}): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "animate-enter mx-auto flex w-full flex-col gap-8 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 md:pb-16 lg:px-8 lg:pt-8",
      width === "wide" && "max-w-6xl",
      width === "narrow" && "max-w-3xl",
      className
    ),
    "data-slot": "page",
  };
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const PageHeader = ({
  className,
  ...props
}: React.ComponentProps<"header">): React.ReactElement => (
  <header
    className={cn(
      "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
      className
    )}
    data-slot="page-header"
    {...props}
  />
);

export const PageHeading = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex min-w-0 flex-col gap-1", className)}
    data-slot="page-heading"
    {...props}
  />
);

export const PageEyebrow = ({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement => (
  <p
    className={cn("text-muted-foreground text-xs font-medium", className)}
    data-slot="page-eyebrow"
    {...props}
  />
);

export const PageTitle = ({
  children,
  className,
  ...props
}: React.ComponentProps<"h1">): React.ReactElement => (
  <h1
    className={cn("truncate text-2xl font-bold", className)}
    data-slot="page-title"
    {...props}
  >
    {children}
  </h1>
);

export const PageDescription = ({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement => (
  <p
    className={cn("text-muted-foreground max-w-prose text-sm", className)}
    data-slot="page-description"
    {...props}
  />
);

export const PageActions = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
    data-slot="page-actions"
    {...props}
  />
);

/** A titled block of a page. Whitespace separates sections; no box. */
export const Section = ({
  className,
  ...props
}: React.ComponentProps<"section">): React.ReactElement => (
  <section
    className={cn("flex min-w-0 flex-col gap-3", className)}
    data-slot="section"
    {...props}
  />
);

export const SectionHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex min-h-7 items-center justify-between gap-4", className)}
    data-slot="section-header"
    {...props}
  />
);

export const SectionTitle = ({
  children,
  className,
  ...props
}: React.ComponentProps<"h2">): React.ReactElement => (
  <h2
    className={cn("text-base font-semibold", className)}
    data-slot="section-title"
    {...props}
  >
    {children}
  </h2>
);

export const SectionDescription = ({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement => (
  <p
    className={cn("text-muted-foreground text-xs", className)}
    data-slot="section-description"
    {...props}
  />
);
