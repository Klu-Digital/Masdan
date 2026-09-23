import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Calendar } from "@masdan/ui/components/calendar";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@masdan/ui/components/popover";
import { SelectButton } from "@masdan/ui/components/select";
import { useState } from "react";

import { formatLongDate, parseIsoDate, toIsoDate } from "@/lib/dates";

const isValidIso = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  return toIsoDate(parseIsoDate(value)) === value;
};

export const DatePicker = ({
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  id,
  onValueChange,
  placeholder = "Pick a date",
  value,
}: {
  "aria-invalid"?: boolean;
  "aria-label"?: string;
  id?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) => {
  const [open, setOpen] = useState(false);
  const date = isValidIso(value) ? parseIsoDate(value) : undefined;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <SelectButton
            aria-invalid={ariaInvalid || undefined}
            aria-label={ariaLabel}
            data-placeholder={date ? undefined : ""}
            id={id}
          />
        }
      >
        <span className="flex items-center gap-2">
          <HugeiconsIcon
            className="text-muted-foreground size-4"
            icon={Calendar03Icon}
            strokeWidth={1.8}
          />
          {date ? formatLongDate(value) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-auto">
        <Calendar
          captionLayout="dropdown"
          mode="single"
          onSelect={(selected) => {
            if (selected instanceof Date) {
              onValueChange(toIsoDate(selected));
              setOpen(false);
            }
          }}
          selected={date}
        />
      </PopoverPopup>
    </Popover>
  );
};
