import type { AppRouterClient } from "@masdan/api/routers/index";
import { createORPCClient } from "@orpc/client";
import type { ClientLink } from "@orpc/client";

import { accounts } from "./handlers/accounts";
import { bills } from "./handlers/bills";
import { budgets } from "./handlers/budgets";
import { categories } from "./handlers/categories";
import { goals } from "./handlers/goals";
import {
  currencies,
  exchangeRates,
  featureFlags,
  households,
  interest,
} from "./handlers/household";
import { recurringSchedules } from "./handlers/recurring";
import { reminders } from "./handlers/reminders";
import { reports } from "./handlers/reports";
import { rules } from "./handlers/rules";
import { tags } from "./handlers/tags";
import { transactions } from "./handlers/transactions";
import { transfers } from "./handlers/transfers";
import type { DemoRouter } from "./router";
import { unavailable } from "./util";

const router: DemoRouter = {
  accounts,
  attachments: { list: () => [] },
  bills,
  categories,
  categoryBudgets: budgets,
  currencies,
  exchangeRates,
  featureFlags,
  goals,
  households,
  imports: { list: () => [] },
  interest,
  recurringSchedules,
  reminders,
  reports,
  rules,
  suggestions: {
    forTransaction: () => ({
      message: "Suggestions need the Masdan server.",
      status: "unavailable",
    }),
  },
  tags,
  transactions,
  transfers,
};

// Long enough that loading states show, as they would against a real server.
const LATENCY_MS = 120;

const wait = (signal: AbortSignal | undefined) =>
  // oxlint-disable-next-line promise/avoid-new
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, signal?.aborted ? 0 : LATENCY_MS);
    signal?.addEventListener("abort", () => clearTimeout(timer), {
      once: true,
    });
  });

const handlerAt = (path: readonly string[]): unknown => {
  let node: unknown = router;
  for (const key of path) {
    node =
      typeof node === "object" && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined;
  }
  return node;
};

const link: ClientLink<Record<never, never>> = {
  async call(path, input, options) {
    await wait(options.signal);
    const handler = handlerAt(path);
    if (typeof handler !== "function") {
      throw unavailable();
    }
    // A copy, as from the wire: the query cache must not alias the store.
    return structuredClone(await handler(input));
  },
};

export const client: AppRouterClient = createORPCClient(link);
