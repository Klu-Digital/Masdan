import { EChartsComposedChart } from "@masdan/ui/components/evilcharts/charts/echarts-composed-chart";
import type { ChartConfig } from "@masdan/ui/components/evilcharts/charts/echarts-composed-chart";
import { Amount } from "@masdan/ui/components/amount";
import { IconTile } from "@masdan/ui/components/icon-tile";
import {
  List,
  ListItem,
  ListItemContent,
  ListItemLeading,
  ListItemTitle,
} from "@masdan/ui/components/list";
import { Meter, MeterIndicator, MeterTrack } from "@masdan/ui/components/meter";
import {
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@masdan/ui/components/page";
import { Skeleton } from "@masdan/ui/components/skeleton";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@masdan/ui/components/stat";
import { formatMoney, toNumber } from "@masdan/ui/lib/money";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  formatLongDate,
  formatMonth,
  formatMonthYear,
  formatShortDate,
} from "@/lib/dates";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";

import type {
  CashFlowReport,
  NetWorthHistory,
  NetWorthReport,
  SpendingReport,
} from "../queries";

const EmptyNote = ({ children }: { children: ReactNode }) => (
  <p className="bg-card text-muted-foreground dark:ring-hairline rounded-3xl px-5 py-8 text-center text-sm dark:ring-1">
    {children}
  </p>
);

const Card = ({ children }: { children: ReactNode }) => (
  <div className="bg-card dark:ring-hairline rounded-3xl p-5 sm:p-6 dark:ring-1">
    {children}
  </div>
);

const compactAxis = (currency: string) => (value: number) =>
  formatMoney(value, currency, { compact: true, sign: "none" });

// Both themes point at the same token; `.dark` redefines it, so the chart follows.
const themeColor = (token: string) => ({
  dark: [`var(${token})`],
  light: [`var(${token})`],
});

const NET_WORTH_CONFIG = {
  assets: { colors: themeColor("--chart-2"), label: "Assets" },
  liabilities: { colors: themeColor("--chart-1"), label: "Liabilities" },
  netWorth: { colors: themeColor("--chart-3"), label: "Net worth" },
} satisfies ChartConfig;

const CASH_FLOW_CONFIG = {
  expense: { colors: themeColor("--chart-1"), label: "Money out" },
  income: { colors: themeColor("--chart-2"), label: "Money in" },
} satisfies ChartConfig;

interface ChartRow {
  /** Axis label ("Sep"). */
  label: string;
  /** Tooltip and table label ("September 2026"); the chart's category key. */
  period: string;
}

/** The canvas is invisible to assistive tech, so its values ride along here. */
const ChartTable = <Row extends ChartRow>({
  caption,
  columns,
  currency,
  rows,
}: {
  caption: string;
  columns: { key: keyof Row & string; label: string }[];
  currency: string;
  rows: Row[];
}) => (
  <table className="sr-only">
    <caption>{caption}</caption>
    <thead>
      <tr>
        <th scope="col">Period</th>
        {columns.map((column) => (
          <th key={column.key} scope="col">
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr key={row.period}>
          <th scope="row">{row.period}</th>
          {columns.map((column) => (
            <td key={column.key}>
              {formatMoney(Number(row[column.key]), currency)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

/* ------------------------------------------------------------------ */
/* Net worth today                                                     */
/* ------------------------------------------------------------------ */

export const NetWorthSummary = ({
  currency,
  report,
}: {
  currency: string;
  report: NetWorthReport | undefined;
}) => {
  if (!report) {
    return <Skeleton className="h-40 w-full" radius="3xl" />;
  }
  const position = report.positions.find(
    (item) => item.currencyCode === currency
  );
  const others = report.positions.filter((item) => item !== position);

  return (
    <section aria-label="Net worth" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-xs font-medium">
          Net worth today
        </span>
        <Amount
          animate
          currency={currency}
          size="display"
          value={position?.netWorth ?? 0}
        />
        {others.length > 0 ? (
          <span className="text-muted-foreground text-xs">
            Plus{" "}
            {others
              .map((item) => formatMoney(item.netWorth, item.currencyCode))
              .join(" · ")}
          </span>
        ) : null}
      </div>
      <StatGroup>
        <Stat>
          <StatLabel>Assets</StatLabel>
          <StatValue>
            <Amount currency={currency} value={position?.assets ?? 0} />
          </StatValue>
        </Stat>
        <Stat>
          <StatLabel>Liabilities</StatLabel>
          <StatValue>
            <Amount currency={currency} value={position?.liabilities ?? 0} />
          </StatValue>
        </Stat>
        <Stat>
          <StatLabel>Liquid assets</StatLabel>
          <StatValue>
            <Amount currency={currency} value={position?.liquidAssets ?? 0} />
          </StatValue>
        </Stat>
        <Stat>
          <StatLabel>Liquid net worth</StatLabel>
          <StatValue>
            <Amount currency={currency} value={position?.liquidNetWorth ?? 0} />
          </StatValue>
        </Stat>
      </StatGroup>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Net worth history                                                   */
/* ------------------------------------------------------------------ */

export const NetWorthHistoryChart = ({
  action,
  currency,
  history,
}: {
  /** Replaces the header's description, e.g. a link to the full report. */
  action?: ReactNode;
  currency: string;
  history: NetWorthHistory | undefined;
}) => {
  const points = history?.points ?? [];
  const today = history?.period.today ?? "";
  const data = points.map((point) => {
    const position = point.positions.find(
      (item) => item.currencyCode === currency
    );
    return {
      assets: toNumber(position?.assets ?? 0),
      label:
        history?.granularity === "month"
          ? formatMonth(point.date)
          : formatShortDate(point.date, today),
      liabilities: toNumber(position?.liabilities ?? 0),
      netWorth: toNumber(position?.netWorth ?? 0),
      period: formatLongDate(point.date),
    };
  });

  return (
    <Section aria-busy={history === undefined} aria-label="Net worth history">
      <SectionHeader>
        <SectionTitle>Net worth over time</SectionTitle>
        {action ?? (
          <SectionDescription>Balances at each period end</SectionDescription>
        )}
      </SectionHeader>
      {history === undefined ? (
        <Skeleton className="h-60 w-full" radius="3xl" />
      ) : null}
      {history && data.length === 0 ? (
        <EmptyNote>
          No balance history in this period. Accounts count from their opening
          date.
        </EmptyNote>
      ) : null}
      {data.length > 0 ? (
        <Card>
          <EChartsComposedChart
            className="h-60"
            config={NET_WORTH_CONFIG}
            curveType="monotone"
            data={data}
            xDataKey="period"
          >
            <EChartsComposedChart.Grid />
            <EChartsComposedChart.XAxis
              tickFormatter={(_, index) => data[index]?.label ?? ""}
            />
            <EChartsComposedChart.YAxis tickFormatter={compactAxis(currency)} />
            <EChartsComposedChart.Legend align="left" />
            <EChartsComposedChart.Tooltip
              valueFormatter={(value) => formatMoney(value, currency)}
            />
            <EChartsComposedChart.Bar dataKey="assets" />
            <EChartsComposedChart.Bar dataKey="liabilities" />
            <EChartsComposedChart.Line dataKey="netWorth">
              <EChartsComposedChart.Dot />
            </EChartsComposedChart.Line>
          </EChartsComposedChart>
          <ChartTable
            caption="Assets and liabilities over time"
            columns={[
              { key: "assets", label: "Assets" },
              { key: "liabilities", label: "Liabilities" },
              { key: "netWorth", label: "Net worth" },
            ]}
            currency={currency}
            rows={data}
          />
        </Card>
      ) : null}
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* Cash flow                                                           */
/* ------------------------------------------------------------------ */

export const CashFlowSection = ({
  currency,
  report,
}: {
  currency: string;
  report: CashFlowReport | undefined;
}) => {
  const total = report?.totals.find((item) => item.currencyCode === currency);
  const data = (report?.months ?? []).map((month) => {
    const flow = report?.monthly.find(
      (item) => item.month === month && item.currencyCode === currency
    );
    return {
      expense: toNumber(flow?.expense ?? 0),
      income: toNumber(flow?.income ?? 0),
      label: formatMonth(month),
      period: formatMonthYear(month),
    };
  });
  const net = toNumber(total?.net ?? 0);

  return (
    <Section aria-label="Cash flow">
      <SectionHeader>
        <SectionTitle>Cash flow</SectionTitle>
        <SectionDescription>Transfers are not counted</SectionDescription>
      </SectionHeader>
      {report === undefined ? (
        <Skeleton className="h-60 w-full" radius="3xl" />
      ) : null}
      {report && !total ? (
        <EmptyNote>No income or expenses in this period.</EmptyNote>
      ) : null}
      {total ? (
        <>
          <StatGroup>
            <Stat>
              <StatLabel>Money in</StatLabel>
              <StatValue>
                <Amount currency={currency} tone="auto" value={total.income} />
              </StatValue>
            </Stat>
            <Stat>
              <StatLabel>Money out</StatLabel>
              <StatValue>
                <Amount currency={currency} value={total.expense} />
              </StatValue>
            </Stat>
            <Stat>
              <StatLabel>Net cash flow</StatLabel>
              <StatValue>
                <Amount
                  currency={currency}
                  tone={net < 0 ? "negative" : "default"}
                  value={total.net}
                />
              </StatValue>
            </Stat>
          </StatGroup>
          <Card>
            <EChartsComposedChart
              className="h-60"
              config={CASH_FLOW_CONFIG}
              data={data}
              xDataKey="period"
            >
              <EChartsComposedChart.Grid />
              <EChartsComposedChart.XAxis
                tickFormatter={(_, index) => data[index]?.label ?? ""}
              />
              <EChartsComposedChart.YAxis
                tickFormatter={compactAxis(currency)}
              />
              <EChartsComposedChart.Legend align="left" />
              <EChartsComposedChart.Tooltip
                valueFormatter={(value) => formatMoney(value, currency)}
              />
              <EChartsComposedChart.Bar dataKey="income" />
              <EChartsComposedChart.Bar dataKey="expense" />
            </EChartsComposedChart>
            <ChartTable
              caption="Money in and out by month"
              columns={[
                { key: "income", label: "Money in" },
                { key: "expense", label: "Money out" },
              ]}
              currency={currency}
              rows={data}
            />
          </Card>
        </>
      ) : null}
    </Section>
  );
};

/* ------------------------------------------------------------------ */
/* Spending by category                                                */
/* ------------------------------------------------------------------ */

export const SpendingSection = ({
  currency,
  report,
}: {
  currency: string;
  report: SpendingReport | undefined;
}) => {
  const rows = (report?.categories ?? []).filter(
    (row) => row.currencyCode === currency
  );
  const total = toNumber(
    report?.totals.find((item) => item.currencyCode === currency)?.total ?? 0
  );
  const largest = toNumber(rows[0]?.total ?? 0);

  return (
    <Section aria-label="Spending by category">
      <SectionHeader>
        <SectionTitle>Spending by category</SectionTitle>
        {total > 0 ? (
          <SectionDescription>
            {formatMoney(total, currency)} in total
          </SectionDescription>
        ) : null}
      </SectionHeader>
      {report === undefined ? (
        <Skeleton className="h-64 w-full" radius="3xl" />
      ) : null}
      {report && rows.length === 0 ? (
        <EmptyNote>No spending in this period.</EmptyNote>
      ) : null}
      {report && rows.length > 0 ? (
        <List>
          {rows.map((row) => {
            const value = toNumber(row.total);
            const share = total > 0 ? value / total : 0;
            return (
              <ListItem
                key={row.categoryId}
                render={
                  <Link
                    search={{
                      ...DEFAULT_TRANSACTION_SEARCH,
                      categoryIds: [row.categoryId],
                      dateFrom: report.period.dateFrom,
                      dateTo: report.period.dateTo,
                    }}
                    to="/transactions"
                  />
                }
              >
                <ListItemLeading>
                  <IconTile tint={row.color}>{row.icon}</IconTile>
                </ListItemLeading>
                <ListItemContent>
                  <span className="flex items-baseline justify-between gap-3">
                    <ListItemTitle>{row.name}</ListItemTitle>
                    <span className="shrink-0 text-sm font-medium">
                      <Amount currency={currency} value={row.total} />
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Meter
                      aria-label={`${row.name} share of spending`}
                      className="flex-1"
                      max={largest}
                      value={value}
                    >
                      <MeterTrack>
                        <MeterIndicator tone="brand" />
                      </MeterTrack>
                    </Meter>
                    <span className="text-muted-foreground w-9 shrink-0 text-right text-xs tabular-nums">
                      {Math.round(share * 100)}%
                    </span>
                  </span>
                </ListItemContent>
              </ListItem>
            );
          })}
        </List>
      ) : null}
    </Section>
  );
};
