import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { Calendar } from "@masdan/ui/components/calendar";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@masdan/ui/components/popover";

const parseDate = (value: string): Date | undefined => {
  const [year, month, day] = value.split("-").map(Number);
  if (!(year && month && day)) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
};

const formatDate = (date: Date): string =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0")
    )
    .join("-");

export const DatePicker = ({
  "aria-invalid": ariaInvalid,
  id,
  onValueChange,
  placeholder = "Pick a date",
  value,
}: {
  "aria-invalid"?: boolean;
  id?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) => {
  const date = parseDate(value);
  const label = date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
    : placeholder;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            aria-invalid={ariaInvalid || undefined}
            className="w-full justify-start text-left"
            id={id}
            variant="outline"
          />
        }
      >
        <HugeiconsIcon icon={Calendar01Icon} strokeWidth={2} />
        {label}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-auto">
        <Calendar
          mode="single"
          onSelect={(selected) => {
            if (selected instanceof Date) {
              onValueChange(formatDate(selected));
            }
          }}
          selected={date}
          captionLayout="dropdown"
        />
      </PopoverPopup>
    </Popover>
  );
};
