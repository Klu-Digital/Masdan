"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const TooltipCreateHandle: typeof TooltipPrimitive.createHandle =
  TooltipPrimitive.createHandle;

export const TooltipProvider: typeof TooltipPrimitive.Provider =
  TooltipPrimitive.Provider;

export const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root;

export const TooltipTrigger = (
  props: TooltipPrimitive.Trigger.Props
): React.ReactElement => (
  <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
);

export const TooltipPopup = ({
  className,
  align = "center",
  sideOffset = 4,
  side = "top",
  anchor,
  children,
  portalProps,
  ...props
}: TooltipPrimitive.Popup.Props & {
  align?: TooltipPrimitive.Positioner.Props["align"];
  side?: TooltipPrimitive.Positioner.Props["side"];
  sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"];
  anchor?: TooltipPrimitive.Positioner.Props["anchor"];
  portalProps?: TooltipPrimitive.Portal.Props;
}): React.ReactElement => (
  <TooltipPrimitive.Portal {...portalProps}>
    <TooltipPrimitive.Positioner
      align={align}
      anchor={anchor}
      className="z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom,transform] data-instant:transition-none"
      data-slot="tooltip-positioner"
      side={side}
      sideOffset={sideOffset}
    >
      <TooltipPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ease-spring relative flex h-(--popup-height,auto) w-(--popup-width,auto) origin-(--transform-origin) rounded-xl text-xs text-balance shadow-lg transition-[width,height,scale,opacity] duration-300 data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-150 data-instant:duration-0 data-starting-style:scale-96 data-starting-style:opacity-0 motion-reduce:data-starting-style:scale-100",
          className
        )}
        data-slot="tooltip-popup"
        {...props}
      >
        <TooltipPrimitive.Viewport
          className="relative size-full overflow-clip px-(--viewport-inline-padding) py-1 [--viewport-inline-padding:--spacing(2)] **:data-current:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding)-2px)] **:data-current:opacity-100 **:data-current:transition-opacity **:data-current:data-ending-style:opacity-0 data-instant:transition-none **:data-previous:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding)-2px)] **:data-previous:truncate **:data-previous:opacity-100 **:data-previous:transition-opacity **:data-previous:data-ending-style:opacity-0 **:data-current:data-starting-style:opacity-0 **:data-previous:data-starting-style:opacity-0"
          data-slot="tooltip-viewport"
        >
          {children}
        </TooltipPrimitive.Viewport>
      </TooltipPrimitive.Popup>
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
);
export { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
export { TooltipPopup as TooltipContent };
