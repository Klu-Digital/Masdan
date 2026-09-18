import { TAILWIND_COLORS } from "@masdan/api/colors";
import type { TailwindColor } from "@masdan/api/colors";
import { cn } from "@masdan/ui/lib/utils";

import { COLOR_STYLES } from "./color-styles";

const colorLabel = (color: TailwindColor) =>
  color[0].toUpperCase() + color.slice(1);

export const ColorSelector = ({
  legend = "Colors",
  onValueChange,
  value,
}: {
  legend?: string;
  onValueChange: (value: TailwindColor) => void;
  value: TailwindColor;
}) => (
  <fieldset className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-11">
    <legend className="sr-only">{legend}</legend>
    {TAILWIND_COLORS.map((color) => (
      <button
        aria-label={colorLabel(color)}
        aria-pressed={color === value}
        className={cn(
          "focus-visible:ring-ring flex w-full flex-col items-center gap-1 rounded-md text-xs outline-none focus-visible:ring-2 data-[selected=true]:ring-2",
          COLOR_STYLES[color].ring
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
              ? COLOR_STYLES[color].swatch
              : COLOR_STYLES[color].badge
          )}
        />
      </button>
    ))}
  </fieldset>
);
