import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const List = ({
  className,
  variant = "grouped",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  /** `inset` sits on a grouped surface, so it takes the canvas colour. */
  variant?: "grouped" | "inset" | "plain";
}): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "flex flex-col",
      variant === "grouped" &&
        "bg-card dark:ring-hairline overflow-hidden rounded-2xl dark:ring-1",
      variant === "inset" && "bg-background overflow-hidden rounded-2xl",
      className
    ),
    "data-slot": "list",
    "data-variant": variant,
    role: "list",
  };
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

const rowClassName =
  "group/row relative flex min-h-14 w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left outline-none " +
  // Inset separator: starts at the text column, never under the leading tile.
  "after:bg-hairline after:absolute after:inset-x-0 after:bottom-0 after:ms-(--row-inset,1rem) after:h-px last:after:hidden " +
  "has-data-[slot=list-item-leading]:[--row-inset:3.75rem] in-data-[variant=plain]:px-2 in-data-[variant=plain]:has-data-[slot=list-item-leading]:[--row-inset:3.25rem]";

const interactiveClassName =
  "cursor-pointer transition-colors duration-100 hover:bg-accent/70 active:bg-accent focus-visible:bg-accent focus-visible:ring-ring/50 focus-visible:ring-3 focus-visible:ring-inset in-data-[variant=plain]:rounded-xl data-[selected]:bg-brand-soft";

export const ListItem = ({
  className,
  interactive,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  interactive?: boolean;
}): React.ReactElement => {
  const isInteractive = interactive ?? Boolean(render);
  const defaultProps = {
    className: cn(
      rowClassName,
      isInteractive && interactiveClassName,
      className
    ),
    "data-slot": "list-item",
    role: render ? undefined : "listitem",
  };
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

/** A row that performs an action in place (opens a sheet, runs a step). */
export const ListItemButton = ({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">): React.ReactElement => (
  <button
    className={cn(rowClassName, interactiveClassName, className)}
    data-slot="list-item"
    // oxlint-disable-next-line react/button-has-type
    type={type}
    {...props}
  />
);

export const ListItemLeading = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex shrink-0 items-center", className)}
    data-slot="list-item-leading"
    {...props}
  />
);

export const ListItemContent = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)}
    data-slot="list-item-content"
    {...props}
  />
);

export const ListItemTitle = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-1.5 truncate text-sm font-medium",
      className
    )}
    data-slot="list-item-title"
    {...props}
  />
);

export const ListItemDescription = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "text-muted-foreground flex min-w-0 items-center gap-1.5 truncate text-xs",
      className
    )}
    data-slot="list-item-description"
    {...props}
  />
);

export const ListItemTrailing = ({
  chevron = false,
  className,
  children,
  stacked = false,
  ...props
}: React.ComponentProps<"div"> & {
  chevron?: boolean;
  /** Stack a figure over a caption, right-aligned. */
  stacked?: boolean;
}): React.ReactElement => (
  <div
    className={cn(
      "flex shrink-0 items-center gap-2 text-right text-sm",
      stacked && "flex-col items-end gap-0.5",
      className
    )}
    data-slot="list-item-trailing"
    {...props}
  >
    {children}
    {chevron ? (
      <HugeiconsIcon
        aria-hidden="true"
        className="text-faint size-4 transition-transform duration-150 group-hover/row:translate-x-0.5 motion-reduce:transition-none"
        icon={ArrowRight01Icon}
        strokeWidth={2}
      />
    ) : null}
  </div>
);

/** A labelled group of lists, with an optional footnote beneath. */
export const ListSection = ({
  className,
  ...props
}: React.ComponentProps<"section">): React.ReactElement => (
  <section
    className={cn("flex min-w-0 flex-col gap-2", className)}
    data-slot="list-section"
    {...props}
  />
);

export const ListSectionHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "text-muted-foreground flex items-center justify-between gap-3 px-4 text-xs font-medium",
      className
    )}
    data-slot="list-section-header"
    {...props}
  />
);

export const ListSectionFooter = ({
  className,
  ...props
}: React.ComponentProps<"p">): React.ReactElement => (
  <p
    className={cn("text-muted-foreground px-4 text-xs", className)}
    data-slot="list-section-footer"
    {...props}
  />
);
