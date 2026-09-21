"use client";

import { Button } from "@masdan/ui/components/button";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export const FilterBar = ({
  children,
  className,
  hasFilters,
  onClear,
}: {
  children: React.ReactNode;
  className?: string;
  hasFilters: boolean;
  onClear: () => void;
}) => (
  <div className={cn("space-y-3", className)}>
    <div className="flex flex-wrap items-end gap-3">{children}</div>
    {hasFilters ? (
      <Button onClick={onClear} size="sm" type="button" variant="ghost">
        Clear filters
      </Button>
    ) : null}
  </div>
);

export const FilterField = ({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) => (
  <label className={cn("flex min-w-32 flex-1 flex-col gap-1", className)}>
    <span className="text-muted-foreground text-xs font-medium">{label}</span>
    {children}
  </label>
);
