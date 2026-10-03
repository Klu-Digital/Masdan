import type { RouterOutputs } from "@/utils/orpc";

import { seed } from "./seed";

type Outputs = RouterOutputs;

export type Account = Omit<
  Outputs["accounts"]["list"][number],
  "availableCredit" | "balance" | "utilization"
>;
export type Category = Outputs["categories"]["list"][number];
export type Tag = Outputs["tags"]["list"][number];
export type Statement = Outputs["accounts"]["listStatements"][number];
type Snapshot = Omit<
  Outputs["accounts"]["listSnapshots"][number],
  "adjustmentArchivedAt" | "transactionId"
>;
export type Transfer = Omit<
  Outputs["transfers"]["create"],
  "destinationAccount" | "sourceAccount"
>;
type ExchangeRate = Outputs["exchangeRates"]["list"][number];
export type Rule = Pick<
  Outputs["rules"]["list"][number],
  | "actions"
  | "conditions"
  | "createdAt"
  | "enabled"
  | "id"
  | "name"
  | "position"
  | "updatedAt"
>;

type TransactionRow = Outputs["transactions"]["archive"];
export type Transaction = Omit<
  TransactionRow,
  "splits" | "tags" | "transfer"
> & {
  splits: { amount: string; categoryId: string; id: string }[];
  tagIds: string[];
};

export interface Budget {
  amount: string;
  categoryId: string;
  currencyCode: string;
  id: string;
  /** First day of the month. */
  month: string;
  updatedAt: Date;
}

export interface Goal {
  accountId: string;
  archivedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  id: string;
  name: string;
  targetAmount: string;
  targetDate: string | null;
  updatedAt: Date;
}

export type Schedule = Omit<
  Outputs["recurringSchedules"]["list"][number],
  | "accountName"
  | "categoryColor"
  | "categoryIcon"
  | "categoryName"
  | "currencyCode"
  | "lastOccurrenceDate"
  | "postedCount"
  | "tags"
  | "type"
> & { tagIds: string[] };

export interface BillPayment {
  createdAt: Date;
  dueDate: string;
  id: string;
  kind: "card" | "recurring";
  sourceId: string;
  transactionId: string | null;
}

interface DemoUser {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

interface Household {
  createdAt: Date;
  defaultCurrency: string;
  id: string;
  memberId: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface DemoState {
  accounts: Account[];
  billPayments: BillPayment[];
  budgets: Budget[];
  categories: Category[];
  dismissedReminders: Set<string>;
  exchangeRates: ExchangeRate[];
  goals: Goal[];
  household: Household;
  reminderIds: Map<string, string>;
  rules: Rule[];
  schedules: Schedule[];
  snapshots: Snapshot[];
  statements: Statement[];
  tags: Tag[];
  transactions: Transaction[];
  transfers: Transfer[];
  user: DemoUser;
}

let state: DemoState | null = null;

/** Built on first use and dropped on sign-out; nothing outlives the tab. */
export const db = (): DemoState => {
  state ??= seed();
  return state;
};

export const resetDemo = (): void => {
  state = null;
};
