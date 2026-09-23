"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const Checkbox = ({
  className,
  ...props
}: CheckboxPrimitive.Root.Props): React.ReactElement => (
  <CheckboxPrimitive.Root
    className={cn(
      "border-input bg-background ring-ring focus-visible:ring-offset-background aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/48 dark:not-data-checked:bg-input/32 dark:aria-invalid:ring-destructive/24 relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-[.25rem] border shadow-xs transition-shadow outline-none before:rounded-[3px] focus-visible:ring-2 focus-visible:ring-offset-1 data-disabled:cursor-not-allowed data-disabled:opacity-50 sm:size-4 [[data-disabled],[data-checked],[aria-invalid]]:shadow-none",
      className
    )}
    data-slot="checkbox"
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className="text-brand-foreground data-checked:bg-brand data-indeterminate:text-foreground absolute -inset-px flex items-center justify-center rounded-[.25rem] data-unchecked:hidden"
      data-slot="checkbox-indicator"
      render={(
        indicatorProps: React.ComponentProps<"span">,
        state: CheckboxPrimitive.Indicator.State
      ) => (
        <span {...indicatorProps}>
          {state.indeterminate ? (
            <svg
              aria-hidden="true"
              className="size-3.5 sm:size-3"
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.252 12h13.496" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              className="size-3.5 sm:size-3"
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
            </svg>
          )}
        </span>
      )}
    />
  </CheckboxPrimitive.Root>
);
export { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
