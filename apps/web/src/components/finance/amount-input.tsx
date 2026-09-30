"use client";

import { cn } from "@masdan/ui/lib/utils";
import type React from "react";
import { useState } from "react";

import {
  evaluateFormula,
  isFormula,
  sanitizeDecimal,
  sanitizeFormula,
} from "./amount-formula";

/**
 * The hero field of a money form: one large, borderless figure with the
 * currency beside it. Accepts a formula (`12.5*3`) while editing: it shows the result once blurred
 * and the formula again on refocus, but reports only the decimal string the API
 * expects.
 */
export const AmountInput = ({
  className,
  currencySymbol,
  invalid,
  onBlur,
  onFocus,
  onValueChange,
  value,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
  currencySymbol: string;
  invalid?: boolean;
  onValueChange: (value: string) => void;
  value: string;
}): React.ReactElement => {
  // The formula being typed. It lives only in this component, so the form,
  // the API and a reopened record only ever see the calculated value.
  const [draft, setDraft] = useState<{ text: string; result: string } | null>(
    null
  );
  const [focused, setFocused] = useState(false);

  // A value the draft didn't produce (a reset, another field) supersedes it.
  const activeDraft = draft && draft.result === value ? draft : null;
  const shown =
    focused || !activeDraft?.result ? (activeDraft?.text ?? value) : value;
  const unresolved =
    !focused && draft !== null && draft.result === "" && value === "";

  return (
    <label
      className={cn(
        "group/amount focus-within:bg-accent/50 flex w-full cursor-text items-baseline justify-center gap-1 rounded-2xl px-4 py-3 transition-colors",
        (invalid || unresolved) && "bg-danger-soft",
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
        aria-invalid={invalid || unresolved || undefined}
        autoComplete="off"
        className="placeholder:text-faint field-sizing-content max-w-full min-w-[2ch] bg-transparent text-center text-4xl font-semibold tabular-nums outline-none"
        // A formula needs operators, which the decimal keypad doesn't have.
        inputMode="text"
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onChange={(event) => {
          const text = sanitizeFormula(event.target.value);
          if (!isFormula(text)) {
            setDraft(null);
            onValueChange(sanitizeDecimal(text));
            return;
          }
          // An unfinished formula is an empty amount, so it can't be saved.
          const result = evaluateFormula(text) ?? "";
          setDraft({ result, text });
          onValueChange(result);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholder="0.00"
        type="text"
        value={shown}
        {...props}
      />
    </label>
  );
};
