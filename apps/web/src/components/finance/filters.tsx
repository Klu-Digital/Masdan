"use client";

import { ArrowDown01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

/**
 * One row of filters above the content they scope. Chips wrap on narrow
 * screens and scroll horizontally on phones rather than stacking into a form.
 */
export const FilterBar = ({
  children,
  className,
  clearLabel = "Clear",
  hasFilters,
  onClear,
}: {
  children: React.ReactNode;
  className?: string;
  clearLabel?: string;
  hasFilters: boolean;
  onClear: () => void;
}): React.ReactElement => (
  <div
    className={cn(
      "-mx-4 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden",
      className
    )}
    data-slot="filter-bar"
    role="toolbar"
  >
    {children}
    {hasFilters ? (
      <button
        className="text-brand-text hover:bg-brand-soft focus-visible:ring-ring/50 h-8 shrink-0 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 sm:h-7"
        onClick={onClear}
        type="button"
      >
        {clearLabel}
      </button>
    ) : null}
  </div>
);

/**
 * A filter as a pill. Idle it names the dimension ("Account"); set it shows
 * the value and tints. Render it as the trigger of a menu or popover.
 */
export const FilterChip = ({
  active = false,
  children,
  className,
  label,
  onClear,
  ...props
}: React.ComponentProps<"button"> & {
  active?: boolean;
  label: string;
  onClear?: () => void;
}): React.ReactElement => (
  <span
    className={cn(
      "inline-flex h-8 shrink-0 items-center rounded-full transition-colors sm:h-7",
      active
        ? "bg-brand-soft text-brand-text"
        : "bg-secondary text-foreground hover:bg-accent"
    )}
    data-slot="filter-chip"
  >
    <button
      className={cn(
        "focus-visible:ring-ring/50 inline-flex h-full items-center gap-1 rounded-full ps-3 text-xs font-medium whitespace-nowrap outline-none focus-visible:ring-3 [&_svg]:size-3.5",
        active && onClear ? "pe-1" : "pe-2.5",
        className
      )}
      type="button"
      {...props}
    >
      <span className={cn(active && "text-brand-text/80")}>{label}</span>
      {active && children ? (
        <span className="max-w-40 truncate font-semibold">{children}</span>
      ) : null}
      {active && onClear ? null : (
        <HugeiconsIcon
          className="opacity-60"
          icon={ArrowDown01Icon}
          strokeWidth={2}
        />
      )}
    </button>
    {active && onClear ? (
      <button
        aria-label={`Clear ${label.toLowerCase()} filter`}
        className="hover:bg-brand/12 focus-visible:ring-ring/50 me-0.5 inline-flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3 [&_svg]:size-3"
        onClick={onClear}
        type="button"
      >
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2.2} />
      </button>
    ) : null}
  </span>
);

export const FilterField = ({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}): React.ReactElement => (
  <label className={cn("flex min-w-32 flex-1 flex-col gap-1.5", className)}>
    <span className="text-muted-foreground text-xs font-medium">{label}</span>
    {children}
  </label>
);
