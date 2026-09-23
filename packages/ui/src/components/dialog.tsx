"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { XIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { ScrollArea } from "@masdan/ui/components/scroll-area";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const DialogCreateHandle: typeof DialogPrimitive.createHandle =
  DialogPrimitive.createHandle;

export const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

export const DialogPortal: typeof DialogPrimitive.Portal =
  DialogPrimitive.Portal;

export const DialogTrigger = (
  props: DialogPrimitive.Trigger.Props
): React.ReactElement => (
  <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
);

export const DialogClose = (
  props: DialogPrimitive.Close.Props
): React.ReactElement => (
  <DialogPrimitive.Close data-slot="dialog-close" {...props} />
);

export const DialogBackdrop = ({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props): React.ReactElement => (
  <DialogPrimitive.Backdrop
    className={cn(
      "bg-scrim fixed inset-0 z-50 transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-ending-style:duration-200 data-starting-style:opacity-0",
      className
    )}
    data-slot="dialog-backdrop"
    {...props}
  />
);

export const DialogViewport = ({
  className,
  ...props
}: DialogPrimitive.Viewport.Props): React.ReactElement => (
  <DialogPrimitive.Viewport
    className={cn(
      "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
      className
    )}
    data-slot="dialog-viewport"
    {...props}
  />
);

export const DialogPopup = ({
  className,
  children,
  showCloseButton = true,
  bottomStickOnMobile = true,
  closeProps,
  portalProps,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  bottomStickOnMobile?: boolean;
  closeProps?: DialogPrimitive.Close.Props;
  portalProps?: DialogPrimitive.Portal.Props;
}): React.ReactElement => (
  <DialogPortal {...portalProps}>
    <DialogBackdrop />
    <DialogViewport
      className={cn(
        bottomStickOnMobile &&
          "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-10"
      )}
    >
      <DialogPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ease-spring relative row-start-2 flex max-h-full min-h-0 w-full max-w-lg min-w-0 origin-center flex-col rounded-3xl opacity-[calc(1-var(--nested-dialogs))] shadow-2xl transition-[scale,opacity,translate] duration-[420ms] will-change-transform outline-none data-ending-style:opacity-0 data-ending-style:duration-200 data-ending-style:ease-out data-starting-style:opacity-0 motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100 sm:scale-[calc(1-0.06*var(--nested-dialogs))] sm:data-ending-style:scale-96 sm:data-starting-style:scale-96",
          bottomStickOnMobile &&
            "max-sm:max-w-none max-sm:origin-bottom max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-ending-style:translate-y-full max-sm:data-starting-style:translate-y-full motion-reduce:max-sm:data-ending-style:translate-y-0 motion-reduce:max-sm:data-starting-style:translate-y-0",
          className
        )}
        data-slot="dialog-popup"
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute end-3 top-3"
            render={<Button size="icon-sm" variant="secondary" />}
            {...closeProps}
          >
            <HugeiconsIcon icon={XIcon} strokeWidth={2} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogViewport>
  </DialogPortal>
);

export const DialogHeader = ({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">): React.ReactElement => {
  const defaultProps = {
    className: cn("flex flex-col gap-1.5 px-6 pe-14 pt-6 pb-4", className),
    "data-slot": "dialog-header",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const DialogFooter = ({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-end sm:rounded-b-[calc(var(--radius-2xl)-1px)]",
      variant === "default" && "border-hairline border-t py-4",
      variant === "bare" && "pt-2 pb-6",
      className
    ),
    "data-slot": "dialog-footer",
  };

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  });
};

export const DialogTitle = ({
  className,
  ...props
}: DialogPrimitive.Title.Props): React.ReactElement => (
  <DialogPrimitive.Title
    className={cn("text-xl font-semibold", className)}
    data-slot="dialog-title"
    {...props}
  />
);

export const DialogDescription = ({
  className,
  ...props
}: DialogPrimitive.Description.Props): React.ReactElement => (
  <DialogPrimitive.Description
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="dialog-description"
    {...props}
  />
);

export const DialogPanel = ({
  className,
  scrollFade = true,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  scrollFade?: boolean;
}): React.ReactElement => {
  const defaultProps = {
    className: cn(
      "px-6 pb-6 in-[[data-slot=dialog-popup]:has([data-slot=dialog-footer])]:pb-4",
      className
    ),
    "data-slot": "dialog-panel",
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
export { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
export { DialogBackdrop as DialogOverlay, DialogPopup as DialogContent };
