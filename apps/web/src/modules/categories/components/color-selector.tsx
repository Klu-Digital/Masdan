import { CATEGORY_COLORS } from "@masdan/api/categories/constants";
import type { CategoryColor } from "@masdan/api/categories/constants";
import { cn } from "@masdan/ui/lib/utils";

import { CATEGORY_COLOR_STYLES } from "./category-colors";

const colorLabel = (color: CategoryColor) =>
  color[0].toUpperCase() + color.slice(1);

export const ColorSelector = ({
  onValueChange,
  value,
}: {
  onValueChange: (value: CategoryColor) => void;
  value: CategoryColor;
}) => (
  <fieldset className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-11">
    <legend className="sr-only">Category colors</legend>
    {CATEGORY_COLORS.map((color) => (
      <button
        aria-label={colorLabel(color)}
        aria-pressed={color === value}
        className={cn(
          "focus-visible:ring-ring flex w-full flex-col items-center gap-1 rounded-md text-xs outline-none focus-visible:ring-2 data-[selected=true]:ring-2",
          CATEGORY_COLOR_STYLES[color].ring
        )}
        data-selected={color === value}
        key={color}
        onClick={() => onValueChange(color)}
        title={colorLabel(color)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "border-border block size-8 rounded-md border",
            color === value
              ? CATEGORY_COLOR_STYLES[color].swatch
              : CATEGORY_COLOR_STYLES[color].badge
          )}
        />
      </button>
    ))}
  </fieldset>
);
