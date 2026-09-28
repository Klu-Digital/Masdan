import { Button } from "@masdan/ui/components/button";
import { cn } from "@masdan/ui/lib/utils";
import { createPortal } from "react-dom";

export const BulkActionBar = ({
  count,
  onClear,
  onEdit,
}: {
  count: number;
  onClear: () => void;
  onEdit: () => void;
}) =>
  createPortal(
    <div
      aria-hidden={count === 0}
      aria-label="Bulk actions"
      className={cn(
        "bg-popover border-border fixed bottom-32 left-1/2 z-50 flex w-max max-w-full -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-2 shadow-xl transition-all duration-200 motion-reduce:transition-none md:bottom-6",
        count === 0
          ? "pointer-events-none translate-y-2 opacity-0"
          : "translate-y-0 opacity-100"
      )}
      inert={count === 0}
      role="toolbar"
    >
      <span className="text-sm font-medium whitespace-nowrap">
        {count} selected
      </span>
      <Button onClick={onClear} size="sm" variant="secondary">
        Clear
      </Button>
      <Button onClick={onEdit} size="sm">
        Edit…
      </Button>
    </div>,
    document.body
  );
