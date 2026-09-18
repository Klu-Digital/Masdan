import { cn } from "@masdan/ui/lib/utils";

import { colorClass } from "@/components/color-styles";

export const TagBadge = ({ color, name }: { color: string; name: string }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
      colorClass(color)
    )}
  >
    {name}
  </span>
);
