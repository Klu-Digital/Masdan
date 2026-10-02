import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const StatGroup = ({
  className,
  grid = false,
  ...props
}: React.ComponentProps<"dl"> & { grid?: boolean }): React.ReactElement => (
  <dl
    className={cn(
      "bg-card dark:ring-hairline grid grid-cols-2 overflow-hidden rounded-2xl dark:ring-1",
      !grid && "sm:divide-hairline sm:flex sm:divide-x",
      className
    )}
    data-layout={grid ? "grid" : "row"}
    data-slot="stat-group"
    {...props}
  />
);

export const Stat = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "in-data-[slot=stat-group]:max-sm:border-hairline in-data-[layout=grid]:border-hairline flex min-w-0 flex-1 flex-col gap-1 px-4 py-3.5 in-data-[layout=grid]:not-nth-[-n+2]:border-t in-data-[layout=grid]:odd:border-e in-data-[layout=grid]:last:odd:border-e-0 in-data-[slot=stat-group]:max-sm:not-nth-[-n+2]:border-t in-data-[slot=stat-group]:max-sm:odd:border-e in-data-[slot=stat-group]:max-sm:last:odd:border-e-0",
      className
    )}
    data-slot="stat"
    {...props}
  />
);

export const StatLabel = ({
  className,
  ...props
}: React.ComponentProps<"dt">): React.ReactElement => (
  <dt
    className={cn(
      "text-muted-foreground flex items-center gap-1.5 truncate text-xs",
      className
    )}
    data-slot="stat-label"
    {...props}
  />
);

export const StatValue = ({
  className,
  ...props
}: React.ComponentProps<"dd">): React.ReactElement => (
  <dd
    className={cn("truncate text-base font-semibold tabular-nums", className)}
    data-slot="stat-value"
    {...props}
  />
);

export const StatDetail = ({
  className,
  ...props
}: React.ComponentProps<"dd">): React.ReactElement => (
  <dd
    className={cn("text-muted-foreground truncate text-xs", className)}
    data-slot="stat-detail"
    {...props}
  />
);
