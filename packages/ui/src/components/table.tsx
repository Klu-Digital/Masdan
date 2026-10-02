"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export type TableVariant = "default" | "card";

export type TableProps = React.ComponentProps<"table"> & {
  variant?: TableVariant;
  render?: useRender.ComponentProps<"div">["render"];
};

export const Table = ({
  className,
  variant = "default",
  render,
  ...props
}: TableProps): React.ReactElement => {
  const defaultProps = {
    children: (
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        data-slot="table"
        {...props}
      />
    ),
    className: cn(
      "relative w-full overflow-x-auto",
      variant === "card" &&
        "bg-card dark:ring-hairline rounded-2xl px-2 dark:ring-1"
    ),
    "data-slot": "table-container",
    "data-variant": variant,
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, {}),
    render,
  });
};

export const TableHeader = ({
  className,
  ...props
}: React.ComponentProps<"thead">): React.ReactElement => (
  <thead
    className={cn(
      "[&_tr]:border-hairline [&_tr]:border-b [&_tr]:hover:bg-transparent",
      className
    )}
    data-slot="table-header"
    {...props}
  />
);

export const TableBody = ({
  className,
  ...props
}: React.ComponentProps<"tbody">): React.ReactElement => (
  <tbody
    className={cn("[&_tr:last-child]:border-0", className)}
    data-slot="table-body"
    {...props}
  />
);

export const TableFooter = ({
  className,
  ...props
}: React.ComponentProps<"tfoot">): React.ReactElement => (
  <tfoot
    className={cn(
      "border-hairline border-t font-medium [&>tr]:last:border-b-0",
      className
    )}
    data-slot="table-footer"
    {...props}
  />
);

export const TableRow = ({
  className,
  ...props
}: React.ComponentProps<"tr">): React.ReactElement => (
  <tr
    className={cn(
      "border-hairline hover:bg-accent/60 data-[state=selected]:bg-brand-soft relative border-b transition-colors duration-100",
      className
    )}
    data-slot="table-row"
    {...props}
  />
);

export const TableHead = ({
  className,
  ...props
}: React.ComponentProps<"th">): React.ReactElement => (
  <th
    className={cn(
      "text-muted-foreground h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap has-[[role=checkbox]]:w-px first:has-[[role=checkbox]]:pe-0 last:has-[[role=checkbox]]:ps-0",
      className
    )}
    data-slot="table-head"
    {...props}
  />
);

export const TableCell = ({
  className,
  ...props
}: React.ComponentProps<"td">): React.ReactElement => (
  <td
    className={cn(
      "h-11 px-3 py-2 align-middle whitespace-nowrap has-[[role=checkbox]]:w-px first:has-[[role=checkbox]]:pe-0 last:has-[[role=checkbox]]:ps-0",
      className
    )}
    data-slot="table-cell"
    {...props}
  />
);

export const TableCaption = ({
  className,
  ...props
}: React.ComponentProps<"caption">): React.ReactElement => (
  <caption
    className={cn("text-muted-foreground mt-4 text-xs", className)}
    data-slot="table-caption"
    {...props}
  />
);
