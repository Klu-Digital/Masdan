import type { AppRouterClient } from "@masdan/api/routers/index";
import { generateOperationKey } from "@orpc/tanstack-query";
import type { QueryClient } from "@tanstack/react-query";

import { householdPath } from "@/utils/orpc";

type Router = keyof AppRouterClient;

/** Everything that reads balances, postings or what they settle. */
const LEDGER = [
  "accounts",
  "bills",
  "categoryBudgets",
  "goals",
  // Projections read the ledger balance.
  "interest",
  "recurringSchedules",
  "reminders",
  "reports",
  "rules",
  "suggestions",
  "transactions",
  "transfers",
] as const satisfies readonly Router[];

// Erring wide costs a request; erring narrow shows the wrong money.
const STALE_AFTER = {
  accounts: [...LEDGER, "exchangeRates"],
  ask: [
    ...LEDGER,
    "attachments",
    "categories",
    "chatIntegrations",
    "exchangeRates",
    "exports",
    "files",
    "households",
    "imports",
    "tags",
  ],
  categories: ["categories", ...LEDGER],
  categoryBudgets: ["categoryBudgets", "reports"],
  chatIntegrations: ["chatIntegrations"],
  exchangeRates: ["exchangeRates", ...LEDGER],
  goals: ["goals"],
  households: ["households", ...LEDGER],
  imports: ["imports", "suggestions"],
  ledger: LEDGER,
  // Schedules post transactions.
  recurringSchedules: LEDGER,
  reminders: ["reminders"],
  rules: ["rules"],
  tags: ["tags", "transactions", "rules", "reports"],
} as const satisfies Record<string, readonly Router[]>;

export type Write = keyof typeof STALE_AFTER;

/** Refresh what `writes` can have changed in this household. */
export const invalidate = async (
  queryClient: QueryClient,
  activeOrganizationId: string | null,
  ...writes: Write[]
): Promise<void> => {
  const path = householdPath(activeOrganizationId);
  const routers = new Set(writes.flatMap((write) => STALE_AFTER[write]));
  await Promise.all(
    [...routers].map((router) =>
      queryClient.invalidateQueries({
        // The same key `householdOrpc(id)[router].key()` builds.
        queryKey: generateOperationKey([...path, router]),
      })
    )
  );
};
