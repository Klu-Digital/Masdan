import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PALETTE, PALETTE_COLORS } from "@masdan/ui/lib/palette";
import type { PaletteColor } from "@masdan/ui/lib/palette";
import { cn } from "@masdan/ui/lib/utils";

const colorLabel = (color: string) => color[0]?.toUpperCase() + color.slice(1);

/** A row of swatches; arrow keys move within the group like any radio set. */
export const ColorSelector = <T extends string>({
  legend = "Color",
  onValueChange,
  value,
}: {
  legend?: string;
  onValueChange: (value: T) => void;
  value: T | null;
}) => (
  <fieldset className="flex flex-wrap gap-2">
    <legend className="sr-only">{legend}</legend>
    {PALETTE_COLORS.map((color: PaletteColor) => {
      const selected = color === value;
      return (
        <label className="relative" key={color} title={colorLabel(color)}>
          <input
            aria-label={colorLabel(color)}
            checked={selected}
            className="peer sr-only"
            name={legend}
            onChange={() => onValueChange(color as T)}
            type="radio"
            value={color}
          />
          <span
            aria-hidden="true"
            className={cn(
              "text-brand-foreground peer-focus-visible:ring-ring/50 flex size-7 cursor-pointer items-center justify-center rounded-full transition-transform duration-150 peer-focus-visible:ring-3 hover:scale-110 active:scale-95 motion-reduce:hover:scale-100",
              PALETTE[color].solid,
              selected &&
                "ring-foreground ring-offset-background ring-2 ring-offset-2"
            )}
          >
            {selected ? (
              <HugeiconsIcon
                className="size-3.5"
                icon={Tick02Icon}
                strokeWidth={3}
              />
            ) : null}
          </span>
        </label>
      );
    })}
  </fieldset>
);
