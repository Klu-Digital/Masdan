"use client";

import { cn } from "@masdan/ui/lib/utils";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type React from "react";

import {
  moneyParts,
  signPrefix,
  speakMoney,
  toNumber,
} from "@/components/finance/money";
import type { MoneySign } from "@/components/finance/money";
import {
  PRIVACY_MASK,
  usePrivacyMode,
} from "@/components/finance/privacy-mode";
import { useSpringNumber } from "@/components/finance/use-spring-number";

const amountVariants = cva(
  "inline-flex items-baseline whitespace-nowrap tabular-nums",
  {
    defaultVariants: { size: "inherit", tone: "default", weight: "inherit" },
    variants: {
      size: {
        display: "text-4xl font-semibold",
        inherit: "",
        lg: "text-base font-semibold",
        title: "text-xl font-semibold",
      },
      tone: {
        default: "",
        muted: "text-muted-foreground",
        negative: "text-destructive-foreground",
        positive: "text-positive-foreground",
      },
      weight: {
        inherit: "",
        medium: "font-medium",
        semibold: "font-semibold",
      },
    },
  }
);

type AmountTone = NonNullable<VariantProps<typeof amountVariants>["tone"]>;

const amountTone = (tone: AmountTone | "auto", sign: MoneySign): AmountTone => {
  if (tone === "auto") {
    return sign === "in" ? "positive" : "default";
  }
  return tone;
};

export interface AmountProps extends Omit<
  React.ComponentProps<"span">,
  "children"
> {
  /** Re-glide to new values on a spring; the first render is exact. */
  animate?: boolean;
  compact?: boolean;
  currency: string;
  sign?: MoneySign;
  size?: VariantProps<typeof amountVariants>["size"];
  weight?: VariantProps<typeof amountVariants>["weight"];
  /** `auto` colours incoming money green and leaves everything else neutral. */
  tone?: AmountTone | "auto";
  value: string | number;
}

/** The one way the product prints money. */
export const Amount = ({
  animate = false,
  className,
  compact = false,
  currency,
  sign = "auto",
  size = "inherit",
  tone = "default",
  value,
  weight = "inherit",
  ...props
}: AmountProps): React.ReactElement => {
  const [privacyOn] = usePrivacyMode();
  const target = toNumber(value);
  const shown = useSpringNumber(target, animate);
  const parts = moneyParts(animate ? shown : target, currency, { compact });
  const prefix = signPrefix(sign, parts.negative);
  const resolvedTone = amountTone(tone, sign);
  const stepped = size === "display" || size === "title";

  return (
    <span
      className={cn(
        amountVariants({ size, tone: resolvedTone, weight }),
        className
      )}
      data-slot="amount"
      {...props}
    >
      <span className="sr-only">
        {privacyOn ? "Amount hidden" : speakMoney(value, currency, sign)}
      </span>
      <span aria-hidden="true" className="contents">
        {prefix ? (
          <span className={cn(stepped && "me-0.5 font-normal")}>{prefix}</span>
        ) : null}
        {parts.trailingCurrency ? null : (
          <span
            className={cn(
              stepped &&
                "text-muted-foreground me-[0.08em] self-start text-[0.58em] leading-[1.9] font-medium"
            )}
          >
            {parts.currency}
          </span>
        )}
        <span>{privacyOn ? PRIVACY_MASK : parts.integer}</span>
        {parts.fraction && !privacyOn ? (
          <span
            className={cn(
              stepped && "text-muted-foreground text-[0.62em] font-medium"
            )}
          >
            {parts.fraction}
          </span>
        ) : null}
        {parts.trailingCurrency ? (
          <span
            className={cn(
              "ms-[0.25em]",
              stepped && "text-muted-foreground text-[0.58em]"
            )}
          >
            {parts.currency.trim()}
          </span>
        ) : null}
      </span>
    </span>
  );
};
