import { EChartsComposedChart } from "@masdan/ui/components/evilcharts/charts/echarts-composed-chart";
import type { ChartConfig } from "@masdan/ui/components/evilcharts/charts/echarts-composed-chart";
import { ColorDot, IconTile } from "@masdan/ui/components/icon-tile";
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@masdan/ui/components/table";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { Amount } from "@/components/finance/amount";
import { EmptyNote } from "@/components/finance/empty-note";
import { toNumber } from "@/components/finance/money";
import { usePrivacyMode } from "@/components/finance/privacy-mode";
import { Sensitive } from "@/components/finance/sensitive";
import {
  Stat,
  StatGroup,
  StatLabel,
  StatValue,
} from "@/components/finance/stat";
import { useFormattedMoney } from "@/components/finance/use-formatted-money";
import {
  formatLongDate,
  formatMonth,
  formatMonthYear,
  formatShortDate,
} from "@/lib/dates";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";

import type {
  BudgetPerformanceReport,
  CashFlowReport,
  NetWorthHistory,
  NetWorthReport,
  SpendingReport,
  TagSpendingReport,
} from "../types";

const Card = ({ children }: { children: ReactNode }) => (
  <div className="bg-card dark:ring-hairline rounded-3xl p-5 sm:p-6 dark:ring-1">
    {children}
  </div>
);

const formatRate = (rate: number | null): string =>
  rate === null ? "N/A" : `${rate}%`;

const compactAxis =
  (money: ReturnType<typeof useFormattedMoney>, currency: string) =>
  (value: number) =>
    money(value, currency, { compact: true, sign: "none" });

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

const cellText = <Row extends ChartRow>(
  column: { format?: (value: Row[keyof Row]) => string; key: keyof Row },
  row: Row,
  currency: string,
  money: ReturnType<typeof useFormattedMoney>
): string =>
  column.format
    ? column.format(row[column.key])
    : money(Number(row[column.key]), currency);

/** The canvas is invisible to assistive tech, so its values ride along here. */
const ChartTable = <Row extends ChartRow>({
  caption,
  columns,
  currency,
  rows,
}: {
  caption: string;
  columns: {
    format?: (value: Row[keyof Row]) => string;
    key: keyof Row & string;
    label: string;
  }[];
  currency: string;
  rows: Row[];
}) => {
  const [privacyOn] = usePrivacyMode();
  const money = useFormattedMoney();
  return (
    // A table ignores sr-only's 1px width, so the clip goes on a wrapper.
    <div className="sr-only">
      <table>
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
                  {privacyOn
                    ? "Amount hidden"
                    : cellText(column, row, currency, money)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const NetWorthSummary = ({
  currency,
  report,
}: {
  currency: string;
  report: NetWorthReport | undefined;
}) => {
  const money = useFormattedMoney();
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
              .map((item) => money(item.netWorth, item.currencyCode))
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
  const money = useFormattedMoney();
  const data = useMemo(() => {
    const today = history?.period.today ?? "";
    return (history?.points ?? []).map((point) => {
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
  }, [currency, history]);
  const xAxis = useMemo(
    () => (_: unknown, index: number) => data[index]?.label ?? "",
    [data]
  );
  const yAxis = useMemo(() => compactAxis(money, currency), [currency, money]);
  const tooltip = useMemo(
    () => (value: number) => money(value, currency),
    [currency, money]
  );

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
            <EChartsComposedChart.XAxis tickFormatter={xAxis} />
            <EChartsComposedChart.YAxis tickFormatter={yAxis} />
            <EChartsComposedChart.Legend align="left" />
            <EChartsComposedChart.Tooltip valueFormatter={tooltip} />
            <EChartsComposedChart.Bar
              dataKey="assets"
              outline
              variant="gradient"
            />
            <EChartsComposedChart.Bar
              dataKey="liabilities"
              variant="gradient"
            />
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

export const CashFlowSection = ({
  currency,
  report,
}: {
  currency: string;
  report: CashFlowReport | undefined;
}) => {
  const money = useFormattedMoney();
  const total = report?.totals.find((item) => item.currencyCode === currency);
  const data = useMemo(
    () =>
      (report?.months ?? []).map((month) => {
        const flow = report?.monthly.find(
          (item) => item.month === month && item.currencyCode === currency
        );
        return {
          expense: toNumber(flow?.expense ?? 0),
          income: toNumber(flow?.income ?? 0),
          label: formatMonth(month),
          period: formatMonthYear(month),
          savingsRate: flow?.savingsRate ?? null,
        };
      }),
    [currency, report]
  );
  const xAxis = useMemo(
    () => (_: unknown, index: number) => data[index]?.label ?? "",
    [data]
  );
  const yAxis = useMemo(() => compactAxis(money, currency), [currency, money]);
  const tooltip = useMemo(
    () => (value: number) => money(value, currency),
    [currency, money]
  );
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
          <StatGroup grid>
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
              <StatLabel>Savings rate</StatLabel>
              <StatValue>
                <Sensitive>{formatRate(total.savingsRate)}</Sensitive>
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
              <EChartsComposedChart.XAxis tickFormatter={xAxis} />
              <EChartsComposedChart.YAxis tickFormatter={yAxis} />
              <EChartsComposedChart.Legend align="left" />
              <EChartsComposedChart.Tooltip valueFormatter={tooltip} />
              <EChartsComposedChart.Bar
                dataKey="income"
                outline
                variant="gradient"
              />
              <EChartsComposedChart.Bar
                dataKey="expense"
                outline
                variant="gradient"
              />
            </EChartsComposedChart>
            <ChartTable
              caption="Money in and out by month"
              columns={[
                { key: "income", label: "Money in" },
                { key: "expense", label: "Money out" },
                {
                  format: (value) =>
                    formatRate(value === null ? null : Number(value)),
                  key: "savingsRate",
                  label: "Savings rate",
                },
              ]}
              currency={currency}
              rows={data}
            />
            <ul
              aria-label="Monthly savings rates"
              className="mt-4 grid gap-2 text-sm sm:grid-cols-2"
            >
              {data.map((row) => (
                <li className="flex justify-between gap-4" key={row.period}>
                  <span className="text-muted-foreground">{row.period}</span>
                  <span className="font-medium tabular-nums">
                    <Sensitive>{formatRate(row.savingsRate)}</Sensitive>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </Section>
  );
};

export const BudgetPerformanceSection = ({
  currency,
  report,
}: {
  currency: string;
  report: BudgetPerformanceReport | undefined;
}) => {
  const periodTotal = report?.totals.find(
    (item) => item.currencyCode === currency
  );
  return (
    <Section aria-label="Budget performance">
      <SectionHeader>
        <SectionTitle>Budget performance</SectionTitle>
        <SectionDescription>
          Whole budgeted months, through today
        </SectionDescription>
      </SectionHeader>
      {report === undefined ? (
        <Skeleton className="h-64 w-full" radius="3xl" />
      ) : null}
      {report?.months.length === 0 ? (
        <EmptyNote>
          No budgets in this period. <Link to="/budgets">Go to budgets</Link>
        </EmptyNote>
      ) : null}
      {report &&
      report.months.length > 0 &&
      !report.months.some((month) =>
        month.lines.some((line) => line.currencyCode === currency)
      ) ? (
        <EmptyNote>No budgets in {currency} for this period.</EmptyNote>
      ) : null}
      {periodTotal ? (
        <StatGroup aria-label="Period budget totals">
          <Stat>
            <StatLabel>Budgeted</StatLabel>
            <StatValue>
              <Amount currency={currency} value={periodTotal.budgeted} />
            </StatValue>
          </Stat>
          <Stat>
            <StatLabel>Spent</StatLabel>
            <StatValue>
              <Amount currency={currency} value={periodTotal.spent} />
            </StatValue>
          </Stat>
          <Stat>
            <StatLabel>Variance</StatLabel>
            <StatValue>
              <Amount
                currency={currency}
                tone={
                  periodTotal.variance.startsWith("-") ? "negative" : "default"
                }
                value={periodTotal.variance}
              />
            </StatValue>
          </Stat>
        </StatGroup>
      ) : null}
      {report?.truncated ? (
        <p className="text-muted-foreground text-sm">
          Only the most recent budgeted months are shown.
        </p>
      ) : null}
      {report?.months.map((month) => {
        const lines = month.lines.filter(
          (line) => line.currencyCode === currency
        );
        const total = month.totals.find(
          (item) => item.currencyCode === currency
        );
        if (lines.length === 0) {
          return null;
        }
        return (
          <div className="flex flex-col gap-3" key={month.month}>
            <h3 className="text-base font-semibold">
              {formatMonthYear(month.month)}
            </h3>
            <Table
              aria-label={`${formatMonthYear(month.month)} budget performance`}
              variant="card"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Budgeted</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.categoryId}>
                    <TableCell>
                      {line.icon} {line.name}
                      {line.archived ? " (archived)" : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount currency={currency} value={line.budgeted} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount currency={currency} value={line.spent} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount
                        currency={currency}
                        tone={
                          line.status === "overspent" ? "negative" : "default"
                        }
                        value={line.variance}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {total ? (
                <TableFooter>
                  <TableRow>
                    <TableCell>
                      <strong>Total</strong>
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount currency={currency} value={total.budgeted} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount currency={currency} value={total.spent} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount
                        currency={currency}
                        tone={
                          total.variance.startsWith("-")
                            ? "negative"
                            : "default"
                        }
                        value={total.variance}
                      />
                    </TableCell>
                  </TableRow>
                </TableFooter>
              ) : null}
            </Table>
          </div>
        );
      })}
    </Section>
  );
};

export const SpendingSection = ({
  currency,
  report,
}: {
  currency: string;
  report: SpendingReport | undefined;
}) => {
  const money = useFormattedMoney();
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
            {money(total, currency)} in total
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

export const TagSpendingSection = ({
  currency,
  report,
}: {
  currency: string;
  report: TagSpendingReport | undefined;
}) => {
  const rows = (report?.tags ?? []).filter(
    (row) => row.currencyCode === currency
  );
  const total = toNumber(
    report?.totals.find((item) => item.currencyCode === currency)?.total ?? 0
  );
  const largest = toNumber(rows[0]?.total ?? 0);

  return (
    <Section aria-label="Spending by tag">
      <SectionHeader>
        <SectionTitle>Spending by tag</SectionTitle>
        <SectionDescription>
          A transaction counts toward each of its tags
        </SectionDescription>
      </SectionHeader>
      {report === undefined ? (
        <Skeleton className="h-40 w-full" radius="3xl" />
      ) : null}
      {report && rows.length === 0 ? (
        <EmptyNote>No tagged spending in this period.</EmptyNote>
      ) : null}
      {report && rows.length > 0 ? (
        <List>
          {rows.map((row) => {
            const value = toNumber(row.total);
            const share = total > 0 ? value / total : 0;
            return (
              <ListItem
                key={row.tagId}
                render={
                  <Link
                    search={{
                      ...DEFAULT_TRANSACTION_SEARCH,
                      dateFrom: report.period.dateFrom,
                      dateTo: report.period.dateTo,
                      tagIds: [row.tagId],
                    }}
                    to="/transactions"
                  />
                }
              >
                <ListItemLeading>
                  <ColorDot className="size-3" tint={row.color} />
                </ListItemLeading>
                <ListItemContent>
                  <span className="flex items-baseline justify-between gap-3">
                    <ListItemTitle>
                      {row.name}
                      {row.archived ? " (archived)" : ""}
                    </ListItemTitle>
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
