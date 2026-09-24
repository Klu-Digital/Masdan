import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type MonthBudgets = Awaited<ReturnType<typeof client.budgets.month>>;
export type BudgetLine = MonthBudgets["lines"][number];

// Under "transactions" so every ledger write refreshes actual spending too.
const budgetsQueryKey = (activeOrganizationId: string | null) =>
  ["transactions", activeOrganizationId, "budgets"] as const;

/** `month` undefined is the household's current month, resolved server-side. */
export const monthBudgetsQueryOptions = (
  activeOrganizationId: string | null,
  month: string | undefined
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    placeholderData: (previous) => previous,
    queryFn: () => client.budgets.month({ month }),
    queryKey: [...budgetsQueryKey(activeOrganizationId), month] as const,
  });

export const invalidateBudgets = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  queryClient.invalidateQueries({
    queryKey: budgetsQueryKey(activeOrganizationId),
  });
