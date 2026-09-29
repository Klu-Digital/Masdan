"use client";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export type DataGridSortDirection = "asc" | "desc";

/**
 * The ledger grid: a real table for assistive tech and keyboard users, drawn
 * as dense hairline rows. Headers stick under the app's top bar; group rows
 * (a day, a month) stick beneath them.
 */
export const DataGrid = ({
  className,
  ...props
}: React.ComponentProps<"table">): React.ReactElement => (
  <div className="relative w-full" data-slot="data-grid-container">
    <table
      className={cn(
        "w-full border-separate border-spacing-0 text-sm",
        className
      )}
      data-slot="data-grid"
      {...props}
    />
  </div>
);

export const DataGridHeader = ({
  className,
  ...props
}: React.ComponentProps<"thead">): React.ReactElement => (
  <thead
    className={cn("", className)}
    data-slot="data-grid-header"
    {...props}
  />
);

export const DataGridBody = ({
  className,
  ...props
}: React.ComponentProps<"tbody">): React.ReactElement => (
  <tbody className={cn("", className)} data-slot="data-grid-body" {...props} />
);

export const DataGridRow = ({
  className,
  ...props
}: React.ComponentProps<"tr">): React.ReactElement => (
  <tr
    className={cn(
      "group/grid-row *:border-hairline in-data-[slot=data-grid-body]:hover:*:bg-accent/60 in-data-[slot=data-grid-body]:focus-visible:*:bg-accent in-data-[slot=data-grid-body]:data-[selected]:*:bg-brand-soft outline-none *:border-b in-data-[slot=data-grid-body]:[&[tabindex]]:cursor-pointer",
      className
    )}
    data-slot="data-grid-row"
    {...props}
  />
);

const DataGridHead = ({
  className,
  ...props
}: React.ComponentProps<"th">): React.ReactElement => (
  <th
    className={cn(
      "bg-background/92 text-muted-foreground border-hairline sticky top-13 z-10 h-9 border-b px-3 text-left align-middle text-xs font-medium whitespace-nowrap first:ps-2 last:pe-2 supports-[backdrop-filter]:backdrop-blur-md",
      className
    )}
    data-slot="data-grid-head"
    {...props}
  />
);

export const DataGridCell = ({
  className,
  ...props
}: React.ComponentProps<"td">): React.ReactElement => (
  <td
    className={cn(
      "h-14 px-3 align-middle transition-colors duration-100 first:rounded-s-xl first:ps-2 last:rounded-e-xl last:pe-2",
      className
    )}
    data-slot="data-grid-cell"
    {...props}
  />
);

/** A labelled band across the grid — a day, a month — with an optional total. */
export const DataGridGroupRow = ({
  children,
  colSpan,
  trailing,
}: {
  children: React.ReactNode;
  colSpan: number;
  trailing?: React.ReactNode;
}): React.ReactElement => (
  <tr data-slot="data-grid-group-row">
    <th
      className="bg-background/92 sticky top-22 z-[5] px-2 pt-5 pb-1.5 text-left align-bottom font-normal supports-[backdrop-filter]:backdrop-blur-md"
      colSpan={colSpan}
      scope="colgroup"
    >
      <span className="flex items-baseline justify-between gap-4">
        <span className="text-foreground text-xs font-semibold">
          {children}
        </span>
        {trailing ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {trailing}
          </span>
        ) : null}
      </span>
    </th>
  </tr>
);

const SortIcon = ({ direction }: { direction?: DataGridSortDirection }) => {
  if (direction === "asc") {
    return <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />;
  }
  if (direction === "desc") {
    return <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />;
  }
  return (
    <HugeiconsIcon
      className="opacity-0 transition-opacity group-hover/sort:opacity-60"
      icon={ArrowUpDownIcon}
      strokeWidth={2}
    />
  );
};

export const DataGridColumnHeader = ({
  align = "start",
  children,
  className,
  direction,
  onSort,
}: {
  align?: "start" | "end";
  children: React.ReactNode;
  className?: string;
  direction?: DataGridSortDirection;
  onSort?: () => void;
}): React.ReactElement => (
  <DataGridHead
    aria-sort={direction ? `${direction}ending` : "none"}
    className={cn(align === "end" && "text-right", className)}
  >
    {onSort ? (
      <button
        className={cn(
          "group/sort hover:text-foreground focus-visible:ring-ring/50 -mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors outline-none focus-visible:ring-3 [&_svg]:size-3.5",
          direction && "text-foreground",
          align === "end" && "flex-row-reverse"
        )}
        onClick={onSort}
        type="button"
      >
        {children}
        <SortIcon direction={direction} />
      </button>
    ) : (
      children
    )}
  </DataGridHead>
);
