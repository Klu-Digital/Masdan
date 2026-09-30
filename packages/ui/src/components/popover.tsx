"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const PopoverCreateHandle: typeof PopoverPrimitive.createHandle =
  PopoverPrimitive.createHandle;

export const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root;

export const PopoverTrigger = ({
  className,
  children,
  ...props
}: PopoverPrimitive.Trigger.Props): React.ReactElement => (
  <PopoverPrimitive.Trigger
    className={className}
    data-slot="popover-trigger"
    {...props}
  >
    {children}
  </PopoverPrimitive.Trigger>
);

export const PopoverPopup = ({
  children,
  className,
  side = "bottom",
  align = "center",
  sideOffset = 4,
  alignOffset = 0,
  tooltipStyle = false,
  anchor,
  inset = "default",
  portalProps,
  ...props
}: PopoverPrimitive.Popup.Props & {
  /**
   * Content padding: `none` for lists that manage their own edges; `list` is
   * `none` for a list that scrolls itself, so the popup doesn't scroll too.
   */
  inset?: "default" | "tight" | "none" | "list";
  portalProps?: PopoverPrimitive.Portal.Props;
  side?: PopoverPrimitive.Positioner.Props["side"];
  align?: PopoverPrimitive.Positioner.Props["align"];
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: PopoverPrimitive.Positioner.Props["alignOffset"];
  tooltipStyle?: boolean;
  anchor?: PopoverPrimitive.Positioner.Props["anchor"];
}): React.ReactElement => (
  <PopoverPrimitive.Portal {...portalProps}>
    <PopoverPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      anchor={anchor}
      className="z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom,transform] data-instant:transition-none"
      data-slot="popover-positioner"
      side={side}
      sideOffset={sideOffset}
    >
      <PopoverPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ease-spring relative flex h-(--popup-height,auto) w-(--popup-width,auto) origin-(--transform-origin) rounded-xl shadow-lg transition-[width,height,scale,opacity] duration-300 outline-none has-data-[slot=calendar]:rounded-xl data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-150 data-instant:duration-0 data-starting-style:scale-96 data-starting-style:opacity-0 motion-reduce:data-starting-style:scale-100",
          tooltipStyle &&
            "w-fit rounded-md text-xs text-balance shadow-lg before:rounded-[calc(var(--radius-md)-1px)]",
          className
        )}
        data-slot="popover-popup"
        {...props}
      >
        <PopoverPrimitive.Viewport
          className={cn(
            "relative size-full max-h-(--available-height) overflow-clip px-(--viewport-inline-padding) py-4 [--viewport-inline-padding:--spacing(4)] has-data-[slot=calendar]:p-2 **:data-current:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding)-2px)] **:data-current:opacity-100 **:data-current:transition-opacity **:data-current:data-ending-style:opacity-0 data-instant:transition-none **:data-previous:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding)-2px)] **:data-previous:opacity-100 **:data-previous:transition-opacity **:data-previous:data-ending-style:opacity-0 **:data-current:data-starting-style:opacity-0 **:data-previous:data-starting-style:opacity-0",
            tooltipStyle
              ? "py-1 [--viewport-inline-padding:--spacing(2)]"
              : "not-data-transitioning:overflow-y-auto",
            inset === "tight" &&
              "py-2 [--viewport-inline-padding:--spacing(2)]",
            inset === "none" && "py-0 [--viewport-inline-padding:0px]",
            inset === "list" &&
              "flex flex-col py-0 [--viewport-inline-padding:0px] not-data-transitioning:overflow-y-hidden"
          )}
          data-slot="popover-viewport"
        >
          {children}
        </PopoverPrimitive.Viewport>
      </PopoverPrimitive.Popup>
    </PopoverPrimitive.Positioner>
  </PopoverPrimitive.Portal>
);

export const PopoverClose = ({
  ...props
}: PopoverPrimitive.Close.Props): React.ReactElement => (
  <PopoverPrimitive.Close data-slot="popover-close" {...props} />
);

export const PopoverTitle = ({
  className,
  ...props
}: PopoverPrimitive.Title.Props): React.ReactElement => (
  <PopoverPrimitive.Title
    className={cn("text-lg leading-none font-semibold", className)}
    data-slot="popover-title"
    {...props}
  />
);

export const PopoverDescription = ({
  className,
  ...props
}: PopoverPrimitive.Description.Props): React.ReactElement => (
  <PopoverPrimitive.Description
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="popover-description"
    {...props}
  />
);
export { Popover as PopoverPrimitive } from "@base-ui/react/popover";
export { PopoverPopup as PopoverContent };
