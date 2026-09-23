import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export const Frame = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "bg-muted/72 relative flex flex-col rounded-2xl p-1",
      "*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1",
      className
    )}
    data-slot="frame"
    {...props}
  />
);

export const FramePanel = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "bg-background relative rounded-xl border bg-clip-padding p-5 shadow-xs",
      className
    )}
    data-slot="frame-panel"
    {...props}
  />
);

export const FrameHeader = ({
  className,
  ...props
}: React.ComponentProps<"header">): React.ReactElement => (
  <header
    className={cn("flex flex-col px-5 py-4", className)}
    data-slot="frame-panel-header"
    {...props}
  />
);

export const FrameTitle = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("text-sm font-semibold", className)}
    data-slot="frame-panel-title"
    {...props}
  />
);

export const FrameDescription = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="frame-panel-description"
    {...props}
  />
);

export const FrameFooter = ({
  className,
  ...props
}: React.ComponentProps<"footer">): React.ReactElement => (
  <footer
    className={cn("px-5 py-4", className)}
    data-slot="frame-panel-footer"
    {...props}
  />
);
