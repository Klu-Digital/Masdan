import { householdOrpc } from "@/utils/orpc";

/** The accounts screen's reads, shared by its route loader and its components. */
export const accountsQueries = (activeOrganizationId: string) => {
  const orpc = householdOrpc(activeOrganizationId);
  return {
    accounts: orpc.accounts.list.queryOptions({
      input: { includeArchived: true },
    }),
    netWorth: orpc.reports.netWorth.queryOptions({
      meta: { suppressErrorToast: true },
    }),
    // Card rows read their due dates from here.
    statements: orpc.accounts.statementsSummary.queryOptions(),
  };
};
