import type { RouterInputs, RouterOutputs } from "@/utils/orpc";

export type TransactionList = RouterOutputs["transactions"]["list"];
export type Transaction = TransactionList["items"][number];
export type TransactionListInput = RouterInputs["transactions"]["list"];
export type TransactionDetail = RouterOutputs["transactions"]["get"];
export type TransactionTotalsInput = RouterInputs["transactions"]["totals"];
export type TransactionSummary = RouterOutputs["transactions"]["summary"];
export type TransactionSummaryInput = RouterInputs["transactions"]["summary"];
