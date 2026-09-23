import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

const RADIUS = {
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
  full: "rounded-full",
  lg: "rounded-lg",
  md: "rounded-md",
  xl: "rounded-xl",
} as const;

/** A placeholder in the shape of what is loading. Match `radius` to it. */
export const Skeleton = ({
  className,
  radius = "md",
  ...props
}: React.ComponentProps<"div"> & {
  radius?: keyof typeof RADIUS;
}): React.ReactElement => (
  <div
    aria-hidden="true"
    className={cn(
      "animate-skeleton bg-secondary motion-reduce:animate-none",
      RADIUS[radius],
      className
    )}
    data-slot="skeleton"
    {...props}
  />
);
