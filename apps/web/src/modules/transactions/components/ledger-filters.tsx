import {
  ArrowDownLeft01Icon,
  ArrowUpRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ListViewIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "@masdan/ui/components/button";
import { Input } from "@masdan/ui/components/input";
import { Kbd } from "@masdan/ui/components/kbd";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@masdan/ui/components/menu";
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from "@masdan/ui/components/popover";
import { cn } from "@masdan/ui/lib/utils";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { DatePicker } from "@/components/date-picker";
import {
  FilterBar,
  FilterChip,
  FilterField,
  FilterToggle,
} from "@/components/finance/filters";
import { formatShortDate } from "@/lib/dates";

import { resolveDateRange } from "../search";
import type { DatePreset, TransactionSearch } from "../search";

export interface FilterOption {
  label: string;
  leading?: ReactNode;
  value: string;
}

const SEARCH_DEBOUNCE_MS = 250;

const OptionLabel = ({
  children,
  className,
  icon,
}: {
  children: ReactNode;
  className?: string;
  icon: IconSvgElement;
}) => (
  <span className="flex items-center gap-2">
    <HugeiconsIcon
      className={cn("text-muted-foreground", className)}
      icon={icon}
      strokeWidth={1.8}
    />
    {children}
  </span>
);

export const LedgerSearch = ({
  onChange,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
}) => {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  // The URL changed underneath us (Clear, back button): adopt it.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) {
      return;
    }
    const timer = window.setTimeout(() => onChange(draft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, value]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative w-full">
      <Input
        aria-label="Search transactions"
        start={<HugeiconsIcon icon={Search01Icon} strokeWidth={1.8} />}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft) {
            event.stopPropagation();
            setDraft("");
            onChange("");
          }
        }}
        placeholder="Search notes, categories, accounts, tags"
        ref={input}
        type="search"
        value={draft}
      />
      <span className="pointer-events-none absolute end-2.5 top-1/2 hidden -translate-y-1/2 md:block">
        <Kbd>/</Kbd>
      </span>
    </div>
  );
};

/** A chip that opens a searchable, multi-select list. */
const MultiSelectFilter = ({
  label,
  onChange,
  options,
  selected,
}: {
  label: string;
  onChange: (values: string[]) => void;
  options: FilterOption[];
  selected: string[];
}) => {
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      options.filter((option) =>
        option.label.toLowerCase().includes(query.trim().toLowerCase())
      ),
    [options, query]
  );
  const chosen = options.filter((option) => selected.includes(option.value));
  const summary =
    chosen.length === 1 ? chosen[0]?.label : `${chosen.length} selected`;

  return (
    <Popover onOpenChange={(open) => (open ? null : setQuery(""))}>
      <PopoverTrigger
        render={
          <FilterChip
            active={selected.length > 0}
            label={label}
            onClear={() => onChange([])}
          />
        }
      >
        {summary}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-72" inset="list">
        <div className="flex min-h-0 flex-1 flex-col">
          {options.length > 8 ? (
            <div className="p-2">
              <Input
                aria-label={`Search ${label.toLowerCase()}`}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}`}
                size="sm"
                value={query}
              />
            </div>
          ) : null}
          <fieldset className="flex max-h-72 min-h-0 flex-col overflow-y-auto p-1.5">
            <legend className="sr-only">{label}</legend>
            {visible.length === 0 ? (
              <p className="text-muted-foreground px-2 py-4 text-center text-xs">
                Nothing matches.
              </p>
            ) : null}
            {visible.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <label
                  className="hover:bg-accent has-focus-visible:bg-accent flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm"
                  key={option.value}
                >
                  <input
                    checked={isSelected}
                    className="peer sr-only"
                    onChange={() =>
                      onChange(
                        isSelected
                          ? selected.filter((value) => value !== option.value)
                          : [...selected, option.value]
                      )
                    }
                    type="checkbox"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "peer-focus-visible:ring-ring/50 flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors peer-focus-visible:ring-3",
                      isSelected
                        ? "bg-brand text-brand-foreground border-brand"
                        : "border-input"
                    )}
                  >
                    {isSelected ? (
                      <HugeiconsIcon
                        className="size-3"
                        icon={Tick02Icon}
                        strokeWidth={3}
                      />
                    ) : null}
                  </span>
                  {option.leading}
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {selected.length > 0 ? (
            <div className="border-hairline flex justify-end border-t p-1.5">
              <Button onClick={() => onChange([])} size="sm" variant="ghost">
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
};

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: "This month", value: "this-month" },
  { label: "Last month", value: "last-month" },
  { label: "Last 30 days", value: "last-30" },
  { label: "This year", value: "this-year" },
];

type DateChange = Pick<TransactionSearch, "dateFrom" | "datePreset" | "dateTo">;

const DateRangeFilter = ({
  onChange,
  search,
  today,
}: {
  onChange: (change: DateChange) => void;
  search: TransactionSearch;
  today: string;
}) => {
  const { dateFrom, dateTo } = resolveDateRange(search, today);
  const active = Boolean(dateFrom || dateTo);
  const preset = PRESETS.find((option) => option.value === search.datePreset);
  let summary = preset?.label;
  if (!summary && active) {
    summary = `${dateFrom ? formatShortDate(dateFrom, today) : "Any"} – ${dateTo ? formatShortDate(dateTo, today) : "Any"}`;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <FilterChip
            active={active}
            label="Date"
            onClear={() =>
              onChange({
                dateFrom: undefined,
                datePreset: undefined,
                dateTo: undefined,
              })
            }
          />
        }
      >
        {summary}
      </PopoverTrigger>
      <PopoverPopup align="start" className="w-76" inset="none">
        <div className="flex flex-col p-1.5">
          {PRESETS.map((option) => {
            const selected = preset?.value === option.value;
            return (
              <button
                aria-pressed={selected}
                className="hover:bg-accent focus-visible:bg-accent flex min-h-9 items-center justify-between rounded-md px-2 text-left text-sm outline-none"
                key={option.value}
                onClick={() =>
                  onChange({
                    dateFrom: undefined,
                    datePreset: option.value,
                    dateTo: undefined,
                  })
                }
                type="button"
              >
                {option.label}
                {selected ? (
                  <HugeiconsIcon
                    className="text-brand-text size-4"
                    icon={Tick02Icon}
                    strokeWidth={2.5}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="border-hairline flex flex-col gap-3 border-t p-3">
          <FilterField label="From">
            <DatePicker
              onValueChange={(value) =>
                onChange({ dateFrom: value, datePreset: undefined, dateTo })
              }
              placeholder="Any date"
              value={dateFrom ?? ""}
            />
          </FilterField>
          <FilterField label="To">
            <DatePicker
              onValueChange={(value) =>
                onChange({ dateFrom, datePreset: undefined, dateTo: value })
              }
              placeholder="Any date"
              value={dateTo ?? ""}
            />
          </FilterField>
        </div>
      </PopoverPopup>
    </Popover>
  );
};

const SORTS: { label: string; value: string }[] = [
  { label: "Newest first", value: "date:desc" },
  { label: "Oldest first", value: "date:asc" },
  { label: "Largest first", value: "amount:desc" },
  { label: "Smallest first", value: "amount:asc" },
];

export const LedgerFilters = ({
  accountOptions,
  categoryOptions,
  hasFilters,
  onClear,
  onSearchChange,
  search,
  tagOptions,
  today,
}: {
  accountOptions: FilterOption[];
  categoryOptions: FilterOption[];
  hasFilters: boolean;
  onClear: () => void;
  onSearchChange: (updates: Partial<TransactionSearch>) => void;
  search: TransactionSearch;
  tagOptions: FilterOption[];
  today: string;
}) => {
  const type = search.types.length === 1 ? search.types[0] : undefined;
  const status =
    search.paidStatuses.length === 1 ? search.paidStatuses[0] : undefined;
  const sortValue = `${search.sortBy}:${search.sortDirection}`;

  return (
    <FilterBar hasFilters={hasFilters} onClear={onClear}>
      <DateRangeFilter
        onChange={onSearchChange}
        search={search}
        today={today}
      />
      <Menu>
        <MenuTrigger
          render={
            <FilterChip
              active={Boolean(type)}
              label="Type"
              onClear={() => onSearchChange({ types: [] })}
            />
          }
        >
          {type === "income" ? "Income" : "Expenses"}
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuRadioGroup
            onValueChange={(value) =>
              onSearchChange({
                types: value ? [value as "expense" | "income"] : [],
              })
            }
            value={type ?? ""}
          >
            <MenuRadioItem value="">
              <OptionLabel icon={ListViewIcon}>All types</OptionLabel>
            </MenuRadioItem>
            <MenuRadioItem value="expense">
              <OptionLabel icon={ArrowUpRight01Icon}>Expenses</OptionLabel>
            </MenuRadioItem>
            <MenuRadioItem value="income">
              <OptionLabel icon={ArrowDownLeft01Icon}>Income</OptionLabel>
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuPopup>
      </Menu>
      <MultiSelectFilter
        label="Account"
        onChange={(accountIds) => onSearchChange({ accountIds })}
        options={accountOptions}
        selected={search.accountIds}
      />
      <MultiSelectFilter
        label="Category"
        onChange={(categoryIds) => onSearchChange({ categoryIds })}
        options={categoryOptions}
        selected={search.categoryIds}
      />
      {tagOptions.length > 0 ? (
        <MultiSelectFilter
          label="Tag"
          onChange={(tagIds) => onSearchChange({ tagIds })}
          options={tagOptions}
          selected={search.tagIds}
        />
      ) : null}
      <Menu>
        <MenuTrigger
          render={
            <FilterChip
              active={Boolean(status) || search.includeArchived}
              label="Status"
              onClear={() =>
                onSearchChange({ includeArchived: false, paidStatuses: [] })
              }
            />
          }
        >
          {[
            status === "paid" ? "Paid" : null,
            status === "unpaid" ? "Unpaid" : null,
            search.includeArchived ? "With archived" : null,
          ]
            .filter(Boolean)
            .join(", ")}
        </MenuTrigger>
        <MenuPopup align="start" className="min-w-52">
          <MenuRadioGroup
            onValueChange={(value) =>
              onSearchChange({
                paidStatuses: value ? [value as "paid" | "unpaid"] : [],
              })
            }
            value={status ?? ""}
          >
            <MenuRadioItem value="">
              <OptionLabel icon={ListViewIcon}>Paid and unpaid</OptionLabel>
            </MenuRadioItem>
            <MenuRadioItem value="paid">
              <OptionLabel icon={CheckmarkCircle02Icon}>Paid only</OptionLabel>
            </MenuRadioItem>
            <MenuRadioItem value="unpaid">
              <OptionLabel icon={Clock01Icon}>Unpaid only</OptionLabel>
            </MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuCheckboxItem
            checked={search.includeArchived}
            onCheckedChange={(checked) =>
              onSearchChange({ includeArchived: checked })
            }
          >
            Include archived
          </MenuCheckboxItem>
        </MenuPopup>
      </Menu>
      <FilterToggle
        label="Interest"
        onPressedChange={(includeInterest) =>
          onSearchChange({ includeInterest })
        }
        pressed={search.includeInterest}
      />
      {/* Column headers sort on wide screens; phones get the same choice here. */}
      <div className="flex shrink-0 md:hidden">
        <Menu>
          <MenuTrigger render={<FilterChip label="Sort" />} />
          <MenuPopup align="start">
            {SORTS.map((option) => (
              <MenuItem
                key={option.value}
                onClick={() => {
                  const [sortBy, sortDirection] = option.value.split(":") as [
                    TransactionSearch["sortBy"],
                    TransactionSearch["sortDirection"],
                  ];
                  onSearchChange({ sortBy, sortDirection });
                }}
              >
                <span className="flex-1">{option.label}</span>
                {sortValue === option.value ? (
                  <HugeiconsIcon
                    className="text-brand-text size-4"
                    icon={Tick02Icon}
                    strokeWidth={2.5}
                  />
                ) : null}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </div>
    </FilterBar>
  );
};
