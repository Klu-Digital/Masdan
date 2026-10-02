import type { RouterClient } from "@orpc/server";

import { accountsRouter } from "../accounts/accounts.router";
import { createAskRouter } from "../ask/ask.router";
import { createAskTools } from "../ask/ask.tools";
import { attachmentsRouter } from "../attachments/attachments.router";
import { billsRouter } from "../bills/bills.router";
import { budgetsRouter } from "../budgets/budgets.router";
import { categoriesRouter } from "../categories/categories.router";
import { chatRouter } from "../chat/chat.router";
import { currenciesRouter } from "../currencies/currencies.router";
import { exchangeRatesRouter } from "../exchange-rates/exchange-rates.router";
import { exportsRouter } from "../exports/exports.router";
import { featureFlagsRouter } from "../feature-flags/feature-flags.router";
import { filesRouter } from "../files/files.router";
import { goalsRouter } from "../goals/goals.router";
import { householdsRouter } from "../households/households.router";
import { importsRouter } from "../imports/imports.router";
import { interestRouter } from "../interest/interest.router";
import { invitationsRouter } from "../invitations/invitations.router";
import { recurringRouter } from "../recurring/recurring.router";
import { remindersRouter } from "../reminders/reminders.router";
import { reportsRouter } from "../reports/reports.router";
import { rulesRouter } from "../rules/rules.router";
import { suggestionsRouter } from "../suggestions/suggestions.router";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { adminRouter } from "./admin";

// Mount routers through this or `./admin.ts`, never inline.
const householdRouters = {
  accounts: accountsRouter,
  attachments: attachmentsRouter,
  bills: billsRouter,
  categories: categoriesRouter,
  categoryBudgets: budgetsRouter,
  chatIntegrations: chatRouter,
  currencies: currenciesRouter,
  exchangeRates: exchangeRatesRouter,
  exports: exportsRouter,
  files: filesRouter,
  goals: goalsRouter,
  households: householdsRouter,
  imports: importsRouter,
  interest: interestRouter,
  recurringSchedules: recurringRouter,
  reminders: remindersRouter,
  reports: reportsRouter,
  rules: rulesRouter,
  suggestions: suggestionsRouter,
  tags: tagsRouter,
  transactions: transactionsRouter,
  transfers: transfersRouter,
};

// Only household product routes reach the model, even for a platform admin.
export const askTools = createAskTools(householdRouters);
export const appRouter = {
  ...householdRouters,
  admin: adminRouter,
  ask: createAskRouter(askTools),
  featureFlags: featureFlagsRouter,
  invitations: invitationsRouter,
};
export type AppRouterClient = RouterClient<typeof appRouter>;
