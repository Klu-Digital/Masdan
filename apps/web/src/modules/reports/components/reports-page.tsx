import { Button } from "@masdan/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@masdan/ui/components/empty";
import {
  Page,
  PageActions,
  PageDescription,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@masdan/ui/components/page";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@masdan/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { formatLongDate } from "@/lib/dates";

import { DEFAULT_RANGE, chartGranularity } from "../period";
import type { ReportRange } from "../period";
import {
  cashFlowQueryOptions,
  netWorthHistoryQueryOptions,
  netWorthQueryOptions,
  spendingQueryOptions,
} from "../queries";
import { PeriodPicker } from "./period-picker";
import {
  CashFlowSection,
  NetWorthHistoryChart,
  NetWorthSummary,
  SpendingSection,
} from "./report-sections";

const useReports = (activeOrganizationId: string, range: ReportRange) => {
  const netWorth = useQuery(netWorthQueryOptions(activeOrganizationId));
  const history = useQuery(
    netWorthHistoryQueryOptions(activeOrganizationId, {
      ...range,
      granularity: chartGranularity(range),
    })
  );
  const cashFlow = useQuery(cashFlowQueryOptions(activeOrganizationId, range));
  const spending = useQuery(spendingQueryOptions(activeOrganizationId, range));
  const queries = [netWorth, history, cashFlow, spending];
  return {
    cashFlow: cashFlow.data,
    empty:
      netWorth.data?.positions.length === 0 &&
      history.data?.points.length === 0 &&
      cashFlow.data?.totals.length === 0,
    failed: queries.some((query) => query.isError),
    handleRetry: () => Promise.all(queries.map((query) => query.refetch())),
    history: history.data,
    netWorth: netWorth.data,
    spending: spending.data,
  };
};

/** The household currency first, then any other currency a report holds. */
const currencyOptions = (
  householdCurrency: string,
  reports: ReturnType<typeof useReports>
): string[] => [
  ...new Set([
    householdCurrency,
    ...[
      ...(reports.netWorth?.positions ?? []),
      ...(reports.cashFlow?.totals ?? []),
      ...(reports.spending?.totals ?? []),
    ].map((item) => item.currencyCode),
  ]),
];

export const ReportsPage = ({
  activeOrganizationId,
  ask,
  currency: householdDefault,
}: {
  activeOrganizationId: string;
  /** Ask Masdan, when its flag is on; it reads the same reports. */
  ask?: ReactNode;
  currency: string | null;
}) => {
  const [range, setRange] = useState<ReportRange>(DEFAULT_RANGE);
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const reports = useReports(activeOrganizationId, range);
  const { cashFlow, empty, failed, history, netWorth, spending } = reports;

  const householdCurrency =
    householdDefault ?? netWorth?.defaultCurrency ?? "PHP";
  const currencies = currencyOptions(householdCurrency, reports);
  const currency =
    chosenCurrency && currencies.includes(chosenCurrency)
      ? chosenCurrency
      : householdCurrency;
  const period = cashFlow?.period ?? history?.period;

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>Reports</PageTitle>
          {period ? (
            <PageDescription>
              {formatLongDate(period.dateFrom)} –{" "}
              {formatLongDate(period.dateTo)}
            </PageDescription>
          ) : null}
        </PageHeading>
        <PageActions>
          <PeriodPicker onChange={setRange} resolved={period} value={range} />
          {currencies.length > 1 ? (
            <Select
              onValueChange={(next) => {
                if (typeof next === "string") {
                  setChosenCurrency(next);
                }
              }}
              value={currency}
            >
              <SelectTrigger aria-label="Currency" className="w-auto min-w-24">
                <SelectValue>{currency}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {currencies.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
        </PageActions>
      </PageHeader>

      {ask}

      {failed ? (
        <Empty size="compact">
          <EmptyTitle>Couldn’t load reports</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
          <Button onClick={reports.handleRetry} variant="secondary">
            Try again
          </Button>
        </Empty>
      ) : null}

      {!failed && empty ? (
        <Empty>
          <EmptyTitle>Nothing to report yet</EmptyTitle>
          <EmptyDescription>
            Net worth, cash flow and spending start from your accounts and
            transactions.
          </EmptyDescription>
          <EmptyContent>
            <Button render={<Link to="/accounts" />}>Go to accounts</Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {failed || empty ? null : (
        <>
          <NetWorthSummary currency={currency} report={netWorth} />
          <NetWorthHistoryChart currency={currency} history={history} />
          <div className="grid items-start gap-8 lg:grid-cols-2">
            <CashFlowSection currency={currency} report={cashFlow} />
            <SpendingSection currency={currency} report={spending} />
          </div>
        </>
      )}
    </Page>
  );
};
