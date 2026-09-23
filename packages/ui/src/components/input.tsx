"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
  /** Tabular figures, for amounts and card digits. */
  numeric?: boolean;
  /** A glyph inside the field's leading edge, e.g. a search icon. */
  start?: React.ReactNode;
};

export const Input = ({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  numeric = false,
  start,
  style,
  ...props
}: InputProps): React.ReactElement => {
  const inputClassName = cn(
    "text-foreground placeholder:text-faint h-10 w-full min-w-0 rounded-[inherit] px-3 leading-10 outline-none [transition:background-color_5000000s_ease-in-out_0s] autofill:[-webkit-text-fill-color:var(--foreground)] sm:h-9 sm:leading-9",
    size === "sm" && "h-8 px-2.5 leading-8 sm:h-7.5 sm:leading-7.5",
    size === "lg" && "h-12 px-3.5 leading-12 sm:h-11 sm:leading-11",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    numeric && "tabular-nums",
    start !== undefined && "ps-8.5",
    props.type === "file" &&
      "text-muted-foreground file:text-foreground file:me-3 file:bg-transparent file:text-sm file:font-medium"
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            "border-input bg-background has-aria-invalid:border-destructive/60 has-focus-visible:border-ring has-focus-visible:ring-ring/20 has-focus-visible:has-aria-invalid:border-destructive has-focus-visible:has-aria-invalid:ring-destructive/16 has-autofill:bg-brand-soft dark:bg-muted relative inline-flex w-full rounded-lg border text-base shadow-xs transition-[border-color,box-shadow] duration-150 has-focus-visible:ring-3 has-disabled:opacity-50 sm:text-sm",
          className
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {start === undefined ? null : (
        <span
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute inset-y-0 start-3 flex items-center [&_svg]:size-4"
        >
          {start}
        </span>
      )}
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={style}
          {...props}
        />
      )}
    </span>
  );
};
export { Input as InputPrimitive } from "@base-ui/react/input";
