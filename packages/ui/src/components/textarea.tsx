"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { mergeProps } from "@base-ui/react/merge-props";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export type TextareaProps = React.ComponentPropsWithoutRef<"textarea"> &
  React.RefAttributes<HTMLTextAreaElement> & {
    size?: "sm" | "default" | "lg" | number;
    unstyled?: boolean;
  };

export const Textarea = ({
  className,
  size = "default",
  unstyled = false,
  ref,
  ...props
}: TextareaProps): React.ReactElement => (
  <span
    className={
      cn(
        !unstyled &&
          "border-input bg-background ring-ring/20 has-focus-visible:has-aria-invalid:border-destructive/64 has-focus-visible:has-aria-invalid:ring-destructive/16 has-aria-invalid:border-destructive/36 has-focus-visible:border-ring dark:bg-muted dark:has-aria-invalid:ring-destructive/24 relative inline-flex w-full rounded-lg border text-base shadow-xs transition-shadow has-focus-visible:ring-3 has-disabled:opacity-50 sm:text-sm",
        className
      ) || undefined
    }
    data-size={size}
    data-slot="textarea-control"
  >
    <FieldPrimitive.Control
      ref={ref}
      value={props.value}
      defaultValue={props.defaultValue}
      disabled={props.disabled}
      id={props.id}
      name={props.name}
      render={(defaultProps: React.ComponentProps<"textarea">) => (
        <textarea
          className={cn(
            "text-foreground placeholder:text-faint field-sizing-content min-h-16 w-full rounded-[inherit] px-3 py-2 outline-none",
            size === "sm" &&
              "min-h-16.5 px-[calc(--spacing(2.5)-1px)] py-[calc(--spacing(1)-1px)] max-sm:min-h-19.5",
            size === "lg" &&
              "min-h-18.5 py-[calc(--spacing(2)-1px)] max-sm:min-h-21.5"
          )}
          data-slot="textarea"
          {...mergeProps(defaultProps, props)}
        />
      )}
    />
  </span>
);
export { Field as FieldPrimitive } from "@base-ui/react/field";
