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
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactNode } from "react";

import { formatLongDate } from "@/lib/dates";
import { householdOrpc } from "@/utils/orpc";

import { DEFAULT_RANGE, chartGranularity } from "../period";
import type { ReportRange } from "../period";
import { PeriodPicker } from "./period-picker";
import {
  BudgetPerformanceSection,
  CashFlowSection,
  NetWorthHistoryChart,
  NetWorthSummary,
  SpendingSection,
} from "./report-sections";

const useReports = (activeOrganizationId: string, range: ReportRange) => {
  const { reports } = householdOrpc(activeOrganizationId);
  // Each section renders its own failure state; a new range keeps the old
  // figures on screen until the next ones land.
  const shared = {
    meta: { suppressErrorToast: true },
    placeholderData: keepPreviousData,
  };
  const netWorth = useQuery(reports.netWorth.queryOptions(shared));
  const history = useQuery(
    reports.netWorthHistory.queryOptions({
      ...shared,
      input: { ...range, granularity: chartGranularity(range) },
    })
  );
  const cashFlow = useQuery(
    reports.cashFlow.queryOptions({ ...shared, input: range })
  );
  const spending = useQuery(
    reports.spendingByCategory.queryOptions({ ...shared, input: range })
  );
  const budgetPerformance = useQuery(
    reports.budgetPerformance.queryOptions({ ...shared, input: range })
  );
  const queries = [netWorth, history, cashFlow, spending, budgetPerformance];
  return {
    budgetPerformance: budgetPerformance.data,
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
      ...(reports.budgetPerformance?.totals ?? []),
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
  const {
    budgetPerformance,
    cashFlow,
    empty,
    failed,
    history,
    netWorth,
    spending,
  } = reports;

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
          <BudgetPerformanceSection
            currency={currency}
            report={budgetPerformance}
          />
        </>
      )}
    </Page>
  );
};
