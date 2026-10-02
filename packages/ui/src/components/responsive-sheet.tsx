"use client";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@masdan/ui/components/dialog";
import {
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from "@masdan/ui/components/drawer";
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@masdan/ui/components/sheet";
import { useMediaQuery } from "@masdan/ui/hooks/use-media-query";
import { cn } from "@masdan/ui/lib/utils";
import type React from "react";

export interface ResponsiveSheetProps {
  children: React.ReactNode;
  description?: React.ReactNode;
  desktop?: "dialog" | "sheet";
  footer?: React.ReactNode;
  /** Visually hide the header title (it still names the surface). */
  hideTitle?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  size?: "default" | "lg";
  title: React.ReactNode;
}

/** One API for modal surfaces that feel native on every form factor. */
export const ResponsiveSheet = ({
  children,
  description,
  desktop = "dialog",
  footer,
  hideTitle = false,
  onOpenChange,
  open,
  size = "default",
  title,
}: ResponsiveSheetProps): React.ReactElement => {
  const wide = useMediaQuery({ min: 768 });
  const titleClassName = cn(hideTitle && "sr-only");

  if (!wide) {
    return (
      <Drawer onOpenChange={onOpenChange} open={open} position="bottom">
        <DrawerPopup className="max-h-[92svh]" showBar>
          <DrawerHeader className={cn("pt-7", hideTitle && "pb-0")}>
            <DrawerTitle className={titleClassName}>{title}</DrawerTitle>
            {description ? (
              <DrawerDescription>{description}</DrawerDescription>
            ) : null}
          </DrawerHeader>
          <DrawerPanel className="px-5 pt-1">{children}</DrawerPanel>
          {footer ? (
            <DrawerFooter className="sm:flex-row">{footer}</DrawerFooter>
          ) : null}
        </DrawerPopup>
      </Drawer>
    );
  }

  if (desktop === "sheet") {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetPopup
          className={cn(size === "lg" ? "max-w-xl" : "max-w-md")}
          side="right"
        >
          <SheetHeader className={cn(hideTitle && "pb-0")}>
            <SheetTitle className={titleClassName}>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          <SheetPanel>{children}</SheetPanel>
          {footer ? <SheetFooter>{footer}</SheetFooter> : null}
        </SheetPopup>
      </Sheet>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup
        className={cn(
          "max-h-[88svh]",
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <DialogHeader className={cn(hideTitle && "pb-0")}>
          <DialogTitle className={titleClassName}>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogPanel>{children}</DialogPanel>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogPopup>
    </Dialog>
  );
};
