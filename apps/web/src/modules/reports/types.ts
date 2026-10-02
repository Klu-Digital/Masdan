import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type ConsolidatedNetWorthReport =
  RouterOutputs["reports"]["consolidatedNetWorth"];
export type NetWorthReport = RouterOutputs["reports"]["netWorth"];
export type NetWorthHistory = RouterOutputs["reports"]["netWorthHistory"];
export type NetWorthHistoryInput = RouterInputs["reports"]["netWorthHistory"];
export type CashFlowReport = RouterOutputs["reports"]["cashFlow"];
export type SpendingReport = RouterOutputs["reports"]["spendingByCategory"];
export type TagSpendingReport = RouterOutputs["reports"]["spendingByTag"];
export type BudgetPerformanceReport =
  RouterOutputs["reports"]["budgetPerformance"];
export type LedgerReportInput = RouterInputs["reports"]["cashFlow"];
