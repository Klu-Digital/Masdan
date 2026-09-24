import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useState } from "react";

import { DatePicker } from "@/components/date-picker";

import { PRESET_LABELS, PRESET_ORDER } from "../period";
import type { ReportRange } from "../period";

const isPreset = (value: unknown): value is ReportRange["preset"] =>
  typeof value === "string" && Object.hasOwn(PRESET_LABELS, value);

/**
 * Preset or custom range. Only complete, ordered ranges are reported through
 * `onChange`; switching to custom starts from the range currently shown.
 */
export const PeriodPicker = ({
  onChange,
  resolved,
  value,
}: {
  onChange: (range: ReportRange) => void;
  /** The dates the server resolved the current range to. */
  resolved?: { dateFrom: string; dateTo: string };
  value: ReportRange;
}) => {
  const [draft, setDraft] = useState<{ dateFrom: string; dateTo: string }>({
    dateFrom: value.dateFrom ?? resolved?.dateFrom ?? "",
    dateTo: value.dateTo ?? resolved?.dateTo ?? "",
  });
  const custom = value.preset === "custom";
  const invalid =
    custom && draft.dateFrom !== "" && draft.dateTo !== ""
      ? draft.dateFrom > draft.dateTo
      : false;

  const choosePreset = (preset: ReportRange["preset"]) => {
    if (preset !== "custom") {
      onChange({ preset });
      return;
    }
    const next = {
      dateFrom: resolved?.dateFrom ?? draft.dateFrom,
      dateTo: resolved?.dateTo ?? draft.dateTo,
    };
    setDraft(next);
    onChange({ ...next, preset: "custom" });
  };

  const changeDate = (key: "dateFrom" | "dateTo", date: string) => {
    const next = { ...draft, [key]: date };
    setDraft(next);
    if (next.dateFrom && next.dateTo && next.dateFrom <= next.dateTo) {
      onChange({ ...next, preset: "custom" });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        onValueChange={(next) => {
          if (isPreset(next)) {
            choosePreset(next);
          }
        }}
        value={value.preset}
      >
        <SelectTrigger aria-label="Period" className="w-auto min-w-40">
          <SelectValue>{PRESET_LABELS[value.preset]}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {PRESET_ORDER.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {PRESET_LABELS[preset]}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
      {custom ? (
        <>
          <DatePicker
            aria-invalid={invalid}
            aria-label="From"
            onValueChange={(date) => changeDate("dateFrom", date)}
            placeholder="Start date"
            value={draft.dateFrom}
          />
          <DatePicker
            aria-invalid={invalid}
            aria-label="To"
            onValueChange={(date) => changeDate("dateTo", date)}
            placeholder="End date"
            value={draft.dateTo}
          />
          {invalid ? (
            <p className="text-destructive-foreground text-xs" role="alert">
              The start date must be before the end date.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
