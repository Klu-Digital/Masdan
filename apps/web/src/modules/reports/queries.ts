import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type NetWorthReport = Awaited<
  ReturnType<typeof client.reports.netWorth>
>;
export type NetWorthHistory = Awaited<
  ReturnType<typeof client.reports.netWorthHistory>
>;
export type NetWorthHistoryInput = Parameters<
  typeof client.reports.netWorthHistory
>[0];
export type CashFlowReport = Awaited<
  ReturnType<typeof client.reports.cashFlow>
>;
export type SpendingReport = Awaited<
  ReturnType<typeof client.reports.spendingByCategory>
>;
export type BudgetPerformanceReport = Awaited<
  ReturnType<typeof client.reports.budgetPerformance>
>;
export type BudgetPerformanceInput = Parameters<
  typeof client.reports.budgetPerformance
>[0];
export type LedgerReportInput = Parameters<typeof client.reports.cashFlow>[0];

// Balances move with account and ledger writes, and both invalidate "accounts".
export const netWorthQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    queryFn: () => client.reports.netWorth(),
    queryKey: ["accounts", activeOrganizationId, "net-worth"] as const,
  });

export const netWorthHistoryQueryOptions = (
  activeOrganizationId: string | null,
  input: NetWorthHistoryInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    placeholderData: (previous) => previous,
    queryFn: () => client.reports.netWorthHistory(input),
    queryKey: [
      "accounts",
      activeOrganizationId,
      "net-worth-history",
      input,
    ] as const,
  });

// Under "transactions" so every ledger write refreshes them.
export const budgetPerformanceQueryKey = (
  activeOrganizationId: string | null
) =>
  [
    "transactions",
    activeOrganizationId,
    "reports",
    "budget-performance",
  ] as const;

export const budgetPerformanceQueryOptions = (
  activeOrganizationId: string | null,
  input: BudgetPerformanceInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    placeholderData: (previous) => previous,
    queryFn: () => client.reports.budgetPerformance(input),
    queryKey: [
      ...budgetPerformanceQueryKey(activeOrganizationId),
      input,
    ] as const,
  });

// Under "transactions" so every ledger write refreshes them.
export const cashFlowQueryOptions = (
  activeOrganizationId: string | null,
  input: LedgerReportInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    placeholderData: (previous) => previous,
    queryFn: () => client.reports.cashFlow(input),
    queryKey: [
      "transactions",
      activeOrganizationId,
      "reports",
      "cash-flow",
      input,
    ] as const,
  });

export const spendingQueryOptions = (
  activeOrganizationId: string | null,
  input: LedgerReportInput
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    placeholderData: (previous) => previous,
    queryFn: () => client.reports.spendingByCategory(input),
    queryKey: [
      "transactions",
      activeOrganizationId,
      "reports",
      "spending",
      input,
    ] as const,
  });
