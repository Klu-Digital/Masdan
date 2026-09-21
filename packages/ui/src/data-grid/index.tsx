"use client";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { TableHead as TableHeadPrimitive } from "@masdan/ui/components/table";
import type * as React from "react";

export type DataGridSortDirection = "asc" | "desc";

export { Table as DataGrid } from "@masdan/ui/components/table";
export {
  TableBody as DataGridBody,
  TableCell as DataGridCell,
  TableHeader as DataGridHeader,
  TableRow as DataGridRow,
} from "@masdan/ui/components/table";

const SortIcon = ({ direction }: { direction?: DataGridSortDirection }) => {
  if (direction === "asc") {
    return <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />;
  }
  if (direction === "desc") {
    return <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />;
  }
  return <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} />;
};

export const DataGridColumnHeader = ({
  children,
  direction,
  onSort,
}: {
  children: React.ReactNode;
  direction?: DataGridSortDirection;
  onSort?: () => void;
}) => (
  <TableHeadPrimitive aria-sort={direction ? `${direction}ending` : "none"}>
    {onSort ? (
      <Button
        className="-ms-2"
        onClick={onSort}
        size="sm"
        type="button"
        variant="ghost"
      >
        {children}
        <SortIcon direction={direction} />
      </Button>
    ) : (
      children
    )}
  </TableHeadPrimitive>
);

export { TableHead as DataGridHead } from "@masdan/ui/components/table";
export { Table as DataGridPrimitive } from "@masdan/ui/components/table";
