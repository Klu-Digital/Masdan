export const TRANSACTION_PAID_STATUSES = ["paid", "unpaid"] as const;
export type TransactionPaidStatus = (typeof TRANSACTION_PAID_STATUSES)[number];
