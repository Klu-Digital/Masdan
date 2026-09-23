"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const PreviewCard: typeof PreviewCardPrimitive.Root =
  PreviewCardPrimitive.Root;

export const PreviewCardTrigger = ({
  ...props
}: PreviewCardPrimitive.Trigger.Props): React.ReactElement => (
  <PreviewCardPrimitive.Trigger data-slot="preview-card-trigger" {...props} />
);

export const PreviewCardPopup = ({
  className,
  children,
  align = "center",
  sideOffset = 4,
  anchor,
  portalProps,
  ...props
}: PreviewCardPrimitive.Popup.Props & {
  align?: PreviewCardPrimitive.Positioner.Props["align"];
  sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"];
  anchor?: PreviewCardPrimitive.Positioner.Props["anchor"];
  portalProps?: PreviewCardPrimitive.Portal.Props;
}): React.ReactElement => (
  <PreviewCardPrimitive.Portal {...portalProps}>
    <PreviewCardPrimitive.Positioner
      align={align}
      anchor={anchor}
      className="z-50"
      data-slot="preview-card-positioner"
      sideOffset={sideOffset}
    >
      <PreviewCardPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ease-spring relative flex w-64 origin-(--transform-origin) rounded-xl p-4 text-sm text-balance shadow-lg transition-[scale,opacity] duration-300 data-ending-style:scale-98 data-ending-style:opacity-0 data-ending-style:duration-150 data-instant:duration-0 data-starting-style:scale-96 data-starting-style:opacity-0 motion-reduce:data-starting-style:scale-100",
          className
        )}
        data-slot="preview-card-content"
        {...props}
      >
        {children}
      </PreviewCardPrimitive.Popup>
    </PreviewCardPrimitive.Positioner>
  </PreviewCardPrimitive.Portal>
);
export { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
export {
  PreviewCard as HoverCard,
  PreviewCardTrigger as HoverCardTrigger,
  PreviewCardPopup as HoverCardContent,
};
