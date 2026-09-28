import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { client } from "@/utils/orpc";

export type BillsMonth = Awaited<ReturnType<typeof client.bills.month>>;
export type Bill = BillsMonth["bills"][number];
export type BillTotals = BillsMonth["totals"][number];
export type BillCandidate = Awaited<
  ReturnType<typeof client.bills.candidates>
>[number];

// Under "accounts": payments, transfers and statements all settle bills, and
// every ledger write already invalidates that key.
const billsQueryKey = (activeOrganizationId: string | null) =>
  ["accounts", activeOrganizationId, "bills"] as const;

export const billsMonthQueryOptions = (
  activeOrganizationId: string | null,
  month: string | undefined
) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    meta: { suppressErrorToast: true },
    placeholderData: (previous) => previous,
    queryFn: () => client.bills.month({ month }),
    queryKey: [...billsQueryKey(activeOrganizationId), "month", month] as const,
  });

export const billCandidatesQueryOptions = (bill: Bill) =>
  queryOptions({
    queryFn: () =>
      client.bills.candidates({
        dueDate: bill.dueDate,
        kind: bill.kind,
        sourceId: bill.sourceId,
      }),
    queryKey: ["bill-candidates", bill.key] as const,
  });

export const billFeedQueryOptions = (activeOrganizationId: string | null) =>
  queryOptions({
    enabled: activeOrganizationId !== null,
    queryFn: () => client.bills.feed.status(),
    queryKey: [...billsQueryKey(activeOrganizationId), "feed"] as const,
  });

export const invalidateBills = (
  queryClient: QueryClient,
  activeOrganizationId: string | null
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: billsQueryKey(activeOrganizationId),
    }),
    queryClient.invalidateQueries({ queryKey: ["bill-candidates"] }),
  ]);
