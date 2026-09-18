import { cn } from "@masdan/ui/lib/utils";

import { colorClass } from "@/components/color-styles";

export const CategoryBadge = ({
  color,
  icon,
  name,
}: {
  color: string;
  icon: string;
  name: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-sm font-medium",
      colorClass(color)
    )}
  >
    <span aria-hidden="true" className="text-base leading-none">
      {icon}
    </span>
    <span>{name}</span>
  </span>
);
