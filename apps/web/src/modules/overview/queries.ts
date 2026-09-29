import type {
  LedgerReportInput,
  NetWorthHistoryInput,
} from "@/modules/reports/types";
import { DEFAULT_TRANSACTION_SEARCH } from "@/modules/transactions/search";
import { householdOrpc } from "@/utils/orpc";

const THIS_MONTH = {
  preset: "this_month",
} as const satisfies LedgerReportInput;
const NET_WORTH_TREND = {
  granularity: "month",
  preset: "last_6_months",
} as const satisfies NetWorthHistoryInput;

const RECENT_COUNT = 8;
const UPCOMING_BILLS = 5;

/** Every read on the overview, shared by its route loader and its sections. */
export const overviewQueries = (organizationId: string) => {
  const orpc = householdOrpc(organizationId);
  // Each section renders its own failure state.
  const meta = { suppressErrorToast: true };
  return {
    accounts: orpc.accounts.list.queryOptions({
      input: { includeArchived: true },
    }),
    month: orpc.reports.cashFlow.queryOptions({ input: THIS_MONTH, meta }),
    netWorth: orpc.reports.netWorth.queryOptions({ meta }),
    recent: orpc.transactions.list.queryOptions({
      input: { ...DEFAULT_TRANSACTION_SEARCH, pageSize: RECENT_COUNT },
    }),
    spending: orpc.reports.spendingByCategory.queryOptions({
      input: THIS_MONTH,
      meta,
    }),
    statements: orpc.accounts.statementsSummary.queryOptions(),
    trend: orpc.reports.netWorthHistory.queryOptions({
      input: NET_WORTH_TREND,
      meta,
    }),
    unpaid: orpc.transactions.list.queryOptions({
      input: {
        ...DEFAULT_TRANSACTION_SEARCH,
        pageSize: UPCOMING_BILLS,
        paidStatuses: ["unpaid"],
        sortDirection: "asc",
      },
    }),
  };
};
