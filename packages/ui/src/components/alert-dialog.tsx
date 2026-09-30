"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export const AlertDialogCreateHandle: typeof AlertDialogPrimitive.createHandle =
  AlertDialogPrimitive.createHandle;

export const AlertDialog: typeof AlertDialogPrimitive.Root =
  AlertDialogPrimitive.Root;

export const AlertDialogPortal: typeof AlertDialogPrimitive.Portal =
  AlertDialogPrimitive.Portal;

export const AlertDialogTrigger = (
  props: AlertDialogPrimitive.Trigger.Props
): React.ReactElement => (
  <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
);

export const AlertDialogBackdrop = ({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props): React.ReactElement => (
  <AlertDialogPrimitive.Backdrop
    className={cn(
      "bg-scrim fixed inset-0 z-50 backdrop-blur-xs transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-ending-style:duration-200 data-starting-style:opacity-0",
      className
    )}
    data-slot="alert-dialog-backdrop"
    {...props}
  />
);

export const AlertDialogViewport = ({
  className,
  ...props
}: AlertDialogPrimitive.Viewport.Props): React.ReactElement => (
  <AlertDialogPrimitive.Viewport
    className={cn(
      "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
      className
    )}
    data-slot="alert-dialog-viewport"
    {...props}
  />
);

export const AlertDialogPopup = ({
  className,
  bottomStickOnMobile = true,
  portalProps,
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  bottomStickOnMobile?: boolean;
  portalProps?: AlertDialogPrimitive.Portal.Props;
}): React.ReactElement => (
  <AlertDialogPortal {...portalProps}>
    <AlertDialogBackdrop />
    <AlertDialogViewport
      className={cn(
        bottomStickOnMobile && "max-sm:grid-rows-[1fr_auto] max-sm:p-3"
      )}
    >
      <AlertDialogPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ease-spring relative row-start-2 flex max-h-full min-h-0 w-full max-w-sm min-w-0 origin-center flex-col rounded-3xl opacity-[calc(1-var(--nested-dialogs))] shadow-2xl transition-[scale,opacity,translate] duration-[380ms] will-change-transform data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100",
          bottomStickOnMobile && "max-sm:max-w-none max-sm:origin-bottom",
          className
        )}
        data-slot="alert-dialog-popup"
        {...props}
      />
    </AlertDialogViewport>
  </AlertDialogPortal>
);

export const AlertDialogHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "flex flex-col gap-1.5 px-6 pt-6 pb-5 text-center",
      className
    )}
    data-slot="alert-dialog-header"
    {...props}
  />
);

export const AlertDialogFooter = ({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}): React.ReactElement => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 px-5 pb-5 *:flex-1 sm:flex-row",
      variant === "default" && "pt-0",
      variant === "bare" && "pt-0",
      className
    )}
    data-slot="alert-dialog-footer"
    {...props}
  />
);

export const AlertDialogTitle = ({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props): React.ReactElement => (
  <AlertDialogPrimitive.Title
    className={cn("text-base font-semibold", className)}
    data-slot="alert-dialog-title"
    {...props}
  />
);

export const AlertDialogDescription = ({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props): React.ReactElement => (
  <AlertDialogPrimitive.Description
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="alert-dialog-description"
    {...props}
  />
);

export const AlertDialogClose = (
  props: AlertDialogPrimitive.Close.Props
): React.ReactElement => (
  <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />
);
export { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
export {
  AlertDialogBackdrop as AlertDialogOverlay,
  AlertDialogPopup as AlertDialogContent,
};
