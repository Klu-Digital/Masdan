"use client";

import { Meter as MeterPrimitive } from "@base-ui/react/meter";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export type MeterTone = "neutral" | "brand" | "positive" | "warning" | "danger";

const TONE_CLASS: Record<MeterTone, string> = {
  brand: "bg-brand",
  danger: "bg-destructive",
  neutral: "bg-foreground/70",
  positive: "bg-positive",
  warning: "bg-warning",
};

export const MeterTrack = ({
  className,
  ...props
}: MeterPrimitive.Track.Props): React.ReactElement => (
  <MeterPrimitive.Track
    className={cn(
      "bg-secondary block h-1.5 w-full overflow-hidden rounded-full",
      className
    )}
    data-slot="meter-track"
    {...props}
  />
);

export const MeterIndicator = ({
  className,
  tone = "brand",
  ...props
}: MeterPrimitive.Indicator.Props & {
  tone?: MeterTone;
}): React.ReactElement => (
  <MeterPrimitive.Indicator
    className={cn(
      "ease-spring block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none",
      TONE_CLASS[tone],
      className
    )}
    data-slot="meter-indicator"
    data-tone={tone}
    {...props}
  />
);

/** A bounded measurement — utilization, spend against a limit. Not progress. */
export const Meter = ({
  className,
  children,
  tone,
  ...props
}: MeterPrimitive.Root.Props & { tone?: MeterTone }): React.ReactElement => (
  <MeterPrimitive.Root
    className={cn("flex w-full flex-col gap-2", className)}
    data-slot="meter"
    {...props}
  >
    {children || (
      <MeterTrack>
        <MeterIndicator tone={tone} />
      </MeterTrack>
    )}
  </MeterPrimitive.Root>
);

export const MeterLabel = ({
  className,
  ...props
}: MeterPrimitive.Label.Props): React.ReactElement => (
  <MeterPrimitive.Label
    className={cn("text-muted-foreground text-xs", className)}
    data-slot="meter-label"
    {...props}
  />
);

export const MeterValue = ({
  className,
  ...props
}: MeterPrimitive.Value.Props): React.ReactElement => (
  <MeterPrimitive.Value
    className={cn("text-foreground text-xs tabular-nums", className)}
    data-slot="meter-value"
    {...props}
  />
);
export { Meter as MeterPrimitive } from "@base-ui/react/meter";
