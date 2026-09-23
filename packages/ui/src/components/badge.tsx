"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@masdan/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";

export const badgeVariants = cva(
  "focus-visible:ring-ring/50 relative inline-flex shrink-0 items-center justify-center gap-1 rounded-sm border border-transparent font-medium whitespace-nowrap outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3 [button&,a&]:cursor-pointer [button&,a&]:pointer-coarse:after:absolute [button&,a&]:pointer-coarse:after:size-full [button&,a&]:pointer-coarse:after:min-h-11 [button&,a&]:pointer-coarse:after:min-w-11",
  {
    defaultVariants: {
      size: "default",
      variant: "secondary",
    },
    variants: {
      size: {
        default: "h-5 min-w-5 px-1.5 text-xs",
        lg: "h-6 min-w-6 rounded-md px-2 text-sm",
        sm: "text-2xs h-4 min-w-4 rounded-xs px-1 font-semibold tracking-normal",
      },
      variant: {
        brand: "bg-brand-soft text-brand-text",
        default: "bg-primary text-primary-foreground",
        destructive: "bg-destructive text-white",
        error: "bg-danger-soft text-destructive-foreground",
        info: "bg-brand-soft text-brand-text",
        outline: "border-border text-muted-foreground",
        secondary: "bg-secondary text-muted-foreground",
        success: "bg-positive-soft text-positive-foreground",
        warning: "bg-warning-soft text-warning-foreground",
      },
    },
  }
);

export interface BadgeProps extends useRender.ComponentProps<"span"> {
  variant?: VariantProps<typeof badgeVariants>["variant"];
  size?: VariantProps<typeof badgeVariants>["size"];
}

export const Badge = ({
  className,
  variant,
  size,
  render,
  ...props
}: BadgeProps): React.ReactElement => {
  const defaultProps = {
    className: cn(badgeVariants({ className, size, variant })),
    "data-slot": "badge",
  };

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  });
};
