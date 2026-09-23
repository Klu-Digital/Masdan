"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { Spinner } from "@masdan/ui/components/spinner";
import { cn } from "@masdan/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type * as React from "react";

export const buttonVariants = cva(
  "focus-visible:ring-ring/50 relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border text-base font-medium whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-out outline-none select-none focus-visible:ring-3 active:scale-[0.97] active:duration-75 disabled:pointer-events-none disabled:opacity-45 data-loading:text-transparent data-loading:select-none motion-reduce:active:scale-100 sm:text-sm pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:-mx-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-9 px-3.5 sm:h-8 sm:px-3",
        icon: "size-9 sm:size-8",
        "icon-lg": "size-10 sm:size-9",
        "icon-sm": "size-8 rounded-md sm:size-7",
        "icon-xl":
          "size-11 rounded-xl sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-5",
        "icon-xs":
          "size-7 rounded-md sm:size-6 [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 rounded-xl px-5 sm:h-10 sm:px-4.5",
        sm: "h-8 gap-1.5 rounded-md px-3 sm:h-7 sm:px-2.5",
        xl: "h-12 rounded-xl px-6 text-lg sm:h-11 sm:text-base [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
        xs: "h-7 gap-1 rounded-md px-2 text-sm sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        brand:
          "bg-brand text-brand-foreground hover:bg-brand/90 *:data-[slot=button-loading-indicator]:text-brand-foreground border-transparent shadow-xs",
        default:
          "bg-primary text-primary-foreground hover:bg-primary/88 *:data-[slot=button-loading-indicator]:text-primary-foreground border-transparent shadow-xs",
        destructive:
          "bg-destructive hover:bg-destructive/90 border-transparent text-white shadow-xs *:data-[slot=button-loading-indicator]:text-white",
        "destructive-outline":
          "bg-danger-soft text-destructive-foreground hover:bg-destructive/16 *:data-[slot=button-loading-indicator]:text-destructive-foreground border-transparent",
        ghost:
          "text-foreground hover:bg-accent data-pressed:bg-accent *:data-[slot=button-loading-indicator]:text-foreground border-transparent",
        link: "text-brand-text *:data-[slot=button-loading-indicator]:text-foreground border-transparent px-0 underline-offset-4 hover:underline active:scale-100",
        outline:
          "bg-background text-foreground hover:bg-surface data-pressed:bg-surface dark:bg-secondary dark:hover:bg-accent *:data-[slot=button-loading-indicator]:text-foreground border-transparent shadow-xs",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent data-pressed:bg-accent *:data-[slot=button-loading-indicator]:text-secondary-foreground border-transparent",
        tinted:
          "bg-brand-soft text-brand-text hover:bg-brand/16 *:data-[slot=button-loading-indicator]:text-brand-text border-transparent",
      },
    },
  }
);

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
  loading?: boolean;
}

export const Button = ({
  className,
  variant,
  size,
  render,
  children,
  loading = false,
  disabled: disabledProp,
  ...props
}: ButtonProps): React.ReactElement => {
  const isDisabled = Boolean(loading || disabledProp);
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    "aria-disabled": loading || undefined,
    children: (
      <>
        {children}
        {loading && (
          <Spinner
            className="pointer-events-none absolute"
            data-slot="button-loading-indicator"
          />
        )}
      </>
    ),
    className: cn(buttonVariants({ className, size, variant })),
    "data-loading": loading ? "" : undefined,
    "data-slot": "button",
    disabled: isDisabled,
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
};
