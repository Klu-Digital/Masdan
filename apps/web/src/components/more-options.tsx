import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@masdan/ui/components/collapsible";
import type { ReactNode } from "react";

/**
 * Progressive disclosure for forms: the common path stays short, and the
 * rarely-needed fields wait one click away.
 */
export const MoreOptions = ({
  children,
  defaultOpen = false,
  label = "More options",
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  label?: string;
}) => (
  <Collapsible defaultOpen={defaultOpen}>
    <CollapsibleTrigger
      render={
        <button
          aria-label={label}
          className="group/more text-brand-text hover:bg-brand-soft focus-visible:ring-ring/50 -mx-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none focus-visible:ring-3"
          type="button"
        />
      }
    >
      {label}
      <HugeiconsIcon
        className="size-4 transition-transform duration-200 group-data-[panel-open]/more:rotate-180 motion-reduce:transition-none"
        icon={ArrowDown01Icon}
        strokeWidth={2}
      />
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <div className="flex flex-col gap-5 pt-3">{children}</div>
    </CollapsiblePanel>
  </Collapsible>
);
