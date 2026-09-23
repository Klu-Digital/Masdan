"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { XIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { ScrollArea } from "@masdan/ui/components/scroll-area";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const Sheet: typeof SheetPrimitive.Root = SheetPrimitive.Root;

export const SheetPortal: typeof SheetPrimitive.Portal = SheetPrimitive.Portal;

export const SheetTrigger = (
  props: SheetPrimitive.Trigger.Props
): React.ReactElement => (
  <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
);

export const SheetClose = (
  props: SheetPrimitive.Close.Props
): React.ReactElement => (
  <SheetPrimitive.Close data-slot="sheet-close" {...props} />
);

export const SheetBackdrop = ({
  className,
  ...props
}: SheetPrimitive.Backdrop.Props): React.ReactElement => (
  <SheetPrimitive.Backdrop
    className={cn(
      "bg-scrim fixed inset-0 z-50 transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-ending-style:duration-200 data-starting-style:opacity-0",
      className
    )}
    data-slot="sheet-backdrop"
    {...props}
  />
);

export const SheetViewport = ({
  className,
  side,
  variant = "inset",
  ...props
}: SheetPrimitive.Viewport.Props & {
  side?: "right" | "left" | "top" | "bottom";
  variant?: "default" | "inset";
}): React.ReactElement => (
  <SheetPrimitive.Viewport
    className={cn(
      "fixed inset-0 z-50 grid",
      side === "bottom" && "grid grid-rows-[1fr_auto] pt-10",
      side === "top" && "grid grid-rows-[auto_1fr] pb-12",
      side === "left" && "flex justify-start",
      side === "right" && "flex justify-end",
      variant === "inset" && "sm:p-2",
      className
    )}
    data-slot="sheet-viewport"
    {...props}
  />
);

export const SheetPopup = ({
  className,
  children,
  showCloseButton = true,
  side = "right",
  variant = "inset",
  closeProps,
  portalProps,
  ...props
}: SheetPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  side?: "right" | "left" | "top" | "bottom";
  variant?: "default" | "inset";
  closeProps?: SheetPrimitive.Close.Props;
  portalProps?: SheetPrimitive.Portal.Props;
}): React.ReactElement => (
  <SheetPortal {...portalProps}>
    <SheetBackdrop />
    <SheetViewport side={side} variant={variant}>
      <SheetPrimitive.Popup
        className={cn(
          // Sheets leave along the edge they arrived from, on the same spring.
          "bg-popover text-popover-foreground ease-spring relative flex max-h-full min-h-0 w-full min-w-0 flex-col shadow-2xl transition-[translate,opacity] duration-[460ms] will-change-transform outline-none data-ending-style:duration-240 data-ending-style:ease-in motion-reduce:transition-opacity motion-reduce:data-ending-style:opacity-0 motion-reduce:data-starting-style:opacity-0",
          side === "bottom" &&
            "row-start-2 rounded-t-3xl pb-[env(safe-area-inset-bottom)] data-ending-style:translate-y-full data-starting-style:translate-y-full motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:translate-y-0",
          side === "top" &&
            "rounded-b-3xl data-ending-style:-translate-y-full data-starting-style:-translate-y-full motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:translate-y-0",
          side === "left" &&
            "w-[calc(100%-(--spacing(10)))] max-w-sm data-ending-style:-translate-x-[calc(100%+1rem)] data-starting-style:-translate-x-[calc(100%+1rem)] motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-starting-style:translate-x-0",
          side === "right" &&
            "col-start-2 w-[calc(100%-(--spacing(10)))] max-w-md data-ending-style:translate-x-[calc(100%+1rem)] data-starting-style:translate-x-[calc(100%+1rem)] motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-starting-style:translate-x-0",
          variant === "inset" &&
            (side === "left" || side === "right") &&
            "sm:rounded-3xl",
          className
        )}
        data-slot="sheet-popup"
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            aria-label="Close"
            className="absolute end-3 top-3"
            render={<Button size="icon-sm" variant="secondary" />}
            {...closeProps}
          >
            <HugeiconsIcon icon={XIcon} strokeWidth={2} />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetViewport>
  </SheetPortal>
);

export const SheetHeader = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn("flex flex-col gap-1.5 px-6 pe-14 pt-6 pb-4", className),
    "data-slot": "sheet-header",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const SheetFooter = ({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-end",
      variant === "default" && "border-hairline border-t py-4",
      variant === "bare" && "pt-2 pb-6",
      className
    ),
    "data-slot": "sheet-footer",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const SheetTitle = ({
  className,
  ...props
}: SheetPrimitive.Title.Props): React.ReactElement => (
  <SheetPrimitive.Title
    className={cn("text-xl font-semibold", className)}
    data-slot="sheet-title"
    {...props}
  />
);

export const SheetDescription = ({
  className,
  ...props
}: SheetPrimitive.Description.Props): React.ReactElement => (
  <SheetPrimitive.Description
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="sheet-description"
    {...props}
  />
);

export const SheetPanel = ({
  className,
  scrollFade = true,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  scrollFade?: boolean;
}): React.ReactElement => {
  const defaultProps = {
    className: cn("px-6 pb-6", className),
    "data-slot": "sheet-panel",
  };

  return (
    <ScrollArea overscrollContain scrollFade={scrollFade}>
      {useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
      })}
    </ScrollArea>
  );
};
export { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
export { SheetBackdrop as SheetOverlay, SheetPopup as SheetContent };
