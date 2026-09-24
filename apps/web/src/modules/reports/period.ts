import type {
  HistoryGranularity,
  ReportPreset,
} from "@masdan/api/reports/periods";

import { daysBetween } from "@/lib/dates";

export interface ReportRange {
  dateFrom?: string;
  dateTo?: string;
  preset: ReportPreset;
}

export const PRESET_LABELS: Record<ReportPreset, string> = {
  all_time: "All time",
  custom: "Custom range",
  last_12_months: "Last 12 months",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  last_month: "Last month",
  last_year: "Last year",
  this_month: "This month",
  year_to_date: "Year to date",
};

export const PRESET_ORDER: ReportPreset[] = [
  "this_month",
  "last_month",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "year_to_date",
  "last_year",
  "all_time",
  "custom",
];

export const DEFAULT_RANGE: ReportRange = { preset: "last_6_months" };

/** Columns stay legible: weeks for a month or two, month-ends beyond. */
export const chartGranularity = (range: ReportRange): HistoryGranularity => {
  if (range.preset === "this_month" || range.preset === "last_month") {
    return "week";
  }
  if (range.preset === "custom" && range.dateFrom && range.dateTo) {
    return daysBetween(range.dateFrom, range.dateTo) <= 62 ? "week" : "month";
  }
  return "month";
};
