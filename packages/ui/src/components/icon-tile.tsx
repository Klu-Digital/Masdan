import { paletteOf } from "@masdan/ui/lib/palette";
import { cn } from "@masdan/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";

const tileVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-hidden leading-none select-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: { shape: "rounded", size: "default" },
    variants: {
      shape: { circle: "rounded-full", rounded: "" },
      size: {
        default:
          "size-9 rounded-[10px] text-lg [&_svg:not([class*='size-'])]:size-4.5",
        lg: "size-12 rounded-[14px] text-2xl [&_svg:not([class*='size-'])]:size-6",
        sm: "size-7 rounded-lg text-sm [&_svg:not([class*='size-'])]:size-3.5",
        xl: "size-16 rounded-[18px] text-3xl [&_svg:not([class*='size-'])]:size-8",
        xs: "size-5 rounded-md text-xs [&_svg:not([class*='size-'])]:size-3",
      },
    },
  }
);

/**
 * A tinted glyph square — category emoji, account kind, transfer arrows. The
 * tint comes from the household palette; `neutral` falls back to a grey fill.
 */
export const IconTile = ({
  className,
  shape,
  size,
  tint,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof tileVariants> & {
    /** A household palette name; omitted means a neutral grey tile. */
    tint?: string | null;
  }): React.ReactElement => (
  <span
    className={cn(
      tileVariants({ shape, size }),
      tint ? paletteOf(tint).soft : "bg-secondary text-muted-foreground",
      className
    )}
    data-slot="icon-tile"
    {...props}
  />
);

/** A small colour marker for legends and chips. */
export const ColorDot = ({
  className,
  tint,
  ...props
}: React.ComponentProps<"span"> & {
  tint?: string | null;
}): React.ReactElement => (
  <span
    aria-hidden="true"
    className={cn(
      "inline-block size-2 shrink-0 rounded-full",
      paletteOf(tint).dot,
      className
    )}
    data-slot="color-dot"
    {...props}
  />
);
