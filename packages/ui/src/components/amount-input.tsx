"use client";

import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

/**
 * The hero field of a money form: one large, borderless figure with the
 * currency beside it. Keeps the raw decimal string the API expects.
 */
export const AmountInput = ({
  className,
  currencySymbol,
  invalid,
  onValueChange,
  value,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
  currencySymbol: string;
  invalid?: boolean;
  onValueChange: (value: string) => void;
  value: string;
}): React.ReactElement => (
  <label
    className={cn(
      "group/amount focus-within:bg-accent/50 flex w-full cursor-text items-baseline justify-center gap-1 rounded-2xl px-4 py-3 transition-colors",
      invalid && "bg-danger-soft",
      className
    )}
    data-slot="amount-input"
  >
    <span
      aria-hidden="true"
      className="text-muted-foreground text-xl font-medium font-semibold"
    >
      {currencySymbol}
    </span>
    <input
      aria-invalid={invalid || undefined}
      autoComplete="off"
      className="placeholder:text-faint field-sizing-content max-w-full min-w-[2ch] bg-transparent text-center text-4xl font-semibold tabular-nums outline-none"
      inputMode="decimal"
      onChange={(event) => {
        // Accept digits and one decimal separator; a comma is read as a point.
        const next = event.target.value
          .replace(",", ".")
          .replaceAll(/[^\d.]/gu, "");
        const [whole = "", ...rest] = next.split(".");
        onValueChange(
          rest.length > 0 ? `${whole}.${rest.join("").slice(0, 6)}` : whole
        );
      }}
      placeholder="0.00"
      type="text"
      value={value}
      {...props}
    />
  </label>
);
