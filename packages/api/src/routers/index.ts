import type { RouterClient } from "@orpc/server";

import { accountsRouter } from "../accounts/accounts.router";
import { askRouter } from "../ask/ask.router";
import { attachmentsRouter } from "../attachments/attachments.router";
import { billsRouter } from "../bills/bills.router";
import { budgetsRouter } from "../budgets/budgets.router";
import { categoriesRouter } from "../categories/categories.router";
import { chatRouter } from "../chat/chat.router";
import { currenciesRouter } from "../currencies/currencies.router";
import { exportsRouter } from "../exports/exports.router";
import { featureFlagsRouter } from "../feature-flags/feature-flags.router";
import { filesRouter } from "../files/files.router";
import { goalsRouter } from "../goals/goals.router";
import { householdsRouter } from "../households/households.router";
import { importsRouter } from "../imports/imports.router";
import { invitationsRouter } from "../invitations/invitations.router";
import { jobsRouter } from "../jobs/jobs.router";
import { protectedProcedure, publicProcedure } from "../procedures";
import { recurringRouter } from "../recurring/recurring.router";
import { remindersRouter } from "../reminders/reminders.router";
import { reportsRouter } from "../reports/reports.router";
import { rulesRouter } from "../rules/rules.router";
import { suggestionsRouter } from "../suggestions/suggestions.router";
import { tagsRouter } from "../tags/tags.router";
import { transactionsRouter } from "../transactions/transactions.router";
import { transfersRouter } from "../transfers/transfers.router";
import { adminRouter } from "./admin";

/**
 * The tenant-scoped surface: everything here needs no organization, or runs on
 * `orgProcedure` and can filter on `organizationId`. `admin` is the one subtree
 * that spans tenants — see `./admin.ts`. Mount new routers through one of these
 * two barrels, never inline, so "what reads across organizations?" stays a
 * single file to read.
 */
export const appRouter = {
  accounts: accountsRouter,
  admin: adminRouter,
  ask: askRouter,
  attachments: attachmentsRouter,
  bills: billsRouter,
  budgets: budgetsRouter,
  categories: categoriesRouter,
  chat: chatRouter,
  currencies: currenciesRouter,
  exports: exportsRouter,
  featureFlags: featureFlagsRouter,
  files: filesRouter,
  goals: goalsRouter,
  healthCheck: publicProcedure.handler(() => "OK"),
  households: householdsRouter,
  imports: importsRouter,
  invitations: invitationsRouter,
  jobs: jobsRouter,
  privateData: protectedProcedure.handler(({ context }) => ({
    message: "This is private",
    user: context.session?.user,
  })),
  recurring: recurringRouter,
  reminders: remindersRouter,
  reports: reportsRouter,
  rules: rulesRouter,
  suggestions: suggestionsRouter,
  tags: tagsRouter,
  transactions: transactionsRouter,
  transfers: transfersRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
