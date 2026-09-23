"use client";

import { Dialog as CommandDialogPrimitive } from "@base-ui/react/dialog";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteSeparator,
} from "@masdan/ui/components/autocomplete";
import { cn } from "@masdan/ui/lib/utils";
import type * as React from "react";

export const CommandDialog: typeof CommandDialogPrimitive.Root =
  CommandDialogPrimitive.Root;

export const CommandDialogPortal: typeof CommandDialogPrimitive.Portal =
  CommandDialogPrimitive.Portal;

export const CommandCreateHandle: typeof CommandDialogPrimitive.createHandle =
  CommandDialogPrimitive.createHandle;

export const CommandDialogTrigger = (
  props: CommandDialogPrimitive.Trigger.Props
): React.ReactElement => (
  <CommandDialogPrimitive.Trigger
    data-slot="command-dialog-trigger"
    {...props}
  />
);

export const CommandDialogBackdrop = ({
  className,
  ...props
}: CommandDialogPrimitive.Backdrop.Props): React.ReactElement => (
  <CommandDialogPrimitive.Backdrop
    className={cn(
      "bg-scrim fixed inset-0 z-50 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0",
      className
    )}
    data-slot="command-dialog-backdrop"
    {...props}
  />
);

export const CommandDialogViewport = ({
  className,
  ...props
}: CommandDialogPrimitive.Viewport.Props): React.ReactElement => (
  <CommandDialogPrimitive.Viewport
    className={cn(
      "fixed inset-0 z-50 flex flex-col items-center px-4 py-[max(--spacing(4),4vh)] sm:py-[10vh]",
      className
    )}
    data-slot="command-dialog-viewport"
    {...props}
  />
);

export const CommandDialogPopup = ({
  className,
  children,
  portalProps,
  ...props
}: CommandDialogPrimitive.Popup.Props & {
  portalProps?: CommandDialogPrimitive.Portal.Props;
}): React.ReactElement => (
  <CommandDialogPortal {...portalProps}>
    <CommandDialogBackdrop />
    <CommandDialogViewport>
      <CommandDialogPrimitive.Popup
        className={cn(
          "bg-popover text-popover-foreground ease-spring relative row-start-2 flex max-h-105 min-h-0 w-full max-w-xl min-w-0 -translate-y-[calc(1.25rem*var(--nested-dialogs))] scale-[calc(1-0.1*var(--nested-dialogs))] flex-col overflow-hidden rounded-3xl opacity-[calc(1-0.1*var(--nested-dialogs))] shadow-2xl transition-[scale,opacity,translate] duration-300 will-change-transform outline-none data-ending-style:scale-97 data-ending-style:opacity-0 data-ending-style:duration-150 data-nested:data-ending-style:translate-y-8 data-nested-dialog-open:origin-top data-starting-style:scale-97 data-starting-style:opacity-0 data-nested:data-starting-style:translate-y-8 **:data-[slot=scroll-area-viewport]:data-has-overflow-y:pe-1",
          className
        )}
        data-slot="command-dialog-popup"
        {...props}
      >
        {children}
      </CommandDialogPrimitive.Popup>
    </CommandDialogViewport>
  </CommandDialogPortal>
);

export const Command = ({
  autoHighlight = "always",
  keepHighlight = true,
  ...props
}: React.ComponentProps<typeof Autocomplete>): React.ReactElement => (
  <Autocomplete
    autoHighlight={autoHighlight}
    inline
    keepHighlight={keepHighlight}
    open
    {...props}
  />
);

export const CommandInput = ({
  className,
  placeholder = undefined,
  ...props
}: React.ComponentProps<typeof AutocompleteInput>): React.ReactElement => (
  <div className="px-2.5 py-1.5">
    <AutocompleteInput
      autoFocus
      className={cn(
        "border-transparent! bg-transparent! shadow-none before:hidden has-focus-visible:ring-0",
        className
      )}
      placeholder={placeholder}
      size="lg"
      startAddon={<HugeiconsIcon icon={Search01Icon} strokeWidth={2} />}
      {...props}
    />
  </div>
);

export const CommandList = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteList>): React.ReactElement => (
  <AutocompleteList
    className={cn("not-empty:scroll-py-2 not-empty:p-2", className)}
    data-slot="command-list"
    {...props}
  />
);

export const CommandEmpty = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteEmpty>): React.ReactElement => (
  <AutocompleteEmpty
    className={cn("not-empty:py-6", className)}
    data-slot="command-empty"
    {...props}
  />
);

export const CommandPanel = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "border-hairline relative min-h-0 border-t **:data-[slot=scroll-area-scrollbar]:mt-2",
      className
    )}
    {...props}
  />
);

export const CommandGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroup>): React.ReactElement => (
  <AutocompleteGroup
    className={className}
    data-slot="command-group"
    {...props}
  />
);

export const CommandGroupLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteGroupLabel>): React.ReactElement => (
  <AutocompleteGroupLabel
    className={className}
    data-slot="command-group-label"
    {...props}
  />
);
export { AutocompleteCollection as CommandCollection } from "@masdan/ui/components/autocomplete";
export const CommandItem = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteItem>): React.ReactElement => (
  <AutocompleteItem
    className={cn("py-1.5", className)}
    data-slot="command-item"
    {...props}
  />
);

export const CommandSeparator = ({
  className,
  ...props
}: React.ComponentProps<typeof AutocompleteSeparator>): React.ReactElement => (
  <AutocompleteSeparator
    className={cn("my-2", className)}
    data-slot="command-separator"
    {...props}
  />
);

export const CommandShortcut = ({
  className,
  ...props
}: React.ComponentProps<"kbd">): React.ReactElement => (
  <kbd
    className={cn(
      "text-faint ms-auto font-sans text-xs font-medium tracking-widest",
      className
    )}
    data-slot="command-shortcut"
    {...props}
  />
);

export const CommandFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement => (
  <div
    className={cn(
      "text-muted-foreground border-hairline flex items-center justify-between gap-2 border-t px-5 py-3 text-xs",
      className
    )}
    data-slot="command-footer"
    {...props}
  />
);
export { Dialog as CommandDialogPrimitive } from "@base-ui/react/dialog";
