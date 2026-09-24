import { Badge } from "@masdan/ui/components/badge";

const STATUS_LABELS: Record<
  string,
  {
    label: string;
    variant: "info" | "success" | "warning" | "error" | "outline";
  }
> = {
  committing: { label: "Importing", variant: "info" },
  completed: { label: "Imported", variant: "success" },
  discarded: { label: "Discarded", variant: "outline" },
  failed: { label: "Failed", variant: "error" },
  ready: { label: "Ready to import", variant: "warning" },
  validating: { label: "Checking rows", variant: "info" },
};

export const ImportStatusBadge = ({ status }: { status: string }) => {
  const entry = STATUS_LABELS[status] ?? {
    label: status,
    variant: "outline" as const,
  };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
};
