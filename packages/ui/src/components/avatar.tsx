"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

const AVATAR_SIZES = {
  default: "size-8 text-xs",
  lg: "size-10 text-sm",
  sm: "size-7 text-2xs",
  xl: "size-16 text-xl",
} as const;

export const Avatar = ({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: keyof typeof AVATAR_SIZES;
}): React.ReactElement => (
  <AvatarPrimitive.Root
    className={cn(
      "bg-background relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle font-semibold select-none",
      AVATAR_SIZES[size],
      className
    )}
    data-slot="avatar"
    {...props}
  />
);

export const AvatarImage = ({
  className,
  ...props
}: AvatarPrimitive.Image.Props): React.ReactElement => (
  <AvatarPrimitive.Image
    className={cn(
      "absolute inset-0 z-10 size-full object-cover data-error:invisible data-loading:invisible",
      className
    )}
    data-slot="avatar-image"
    {...props}
  />
);

export const AvatarFallback = ({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props): React.ReactElement => (
  <AvatarPrimitive.Fallback
    className={cn(
      "bg-secondary text-foreground absolute inset-0 flex size-full items-center justify-center rounded-full font-semibold",
      className
    )}
    data-slot="avatar-fallback"
    {...props}
  />
);
export { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
