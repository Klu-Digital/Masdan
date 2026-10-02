import { z } from "zod";

import { getConsolidatedNetWorth } from "../exchange-rates/consolidated";
import { orgProcedure, requirePermission } from "../procedures";
import { isoDate } from "../shared/dates";
import { getBudgetPerformance } from "./budget-performance";
import { HISTORY_GRANULARITIES, REPORT_PRESETS } from "./periods";
import {
  getCashFlow,
  getNetWorth,
  getNetWorthHistory,
  getSpendingByCategory,
  getSpendingByTag,
  resolveReportPeriod,
} from "./reports.queries";

const periodFields = {
  /** Required for `custom`; ignored by every other preset. */
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  preset: z.enum(REPORT_PRESETS).default("this_month"),
};

const customRangeOrder = (
  value: { dateFrom?: string; dateTo?: string; preset: string },
  context: z.RefinementCtx
): void => {
  if (value.preset !== "custom") {
    return;
  }
  if (!(value.dateFrom && value.dateTo)) {
    context.addIssue({
      code: "custom",
      message: "Choose a start and an end date",
      path: ["dateFrom"],
    });
    return;
  }
  if (value.dateFrom > value.dateTo) {
    context.addIssue({
      code: "custom",
      message: "The start date must be before the end date",
      path: ["dateFrom"],
    });
  }
};

const periodValues = z.object(periodFields).superRefine(customRangeOrder);

const ledgerRangeValues = z
  .object({
    ...periodFields,
    accountIds: z.array(z.uuid()).max(50).default([]),
  })
  .superRefine(customRangeOrder);

const historyValues = z
  .object({
    ...periodFields,
    /** Omitted: days up to ~2 months, weeks up to ~6, month-ends beyond. */
    granularity: z.enum(HISTORY_GRANULARITIES).optional(),
  })
  .superRefine(customRangeOrder);

const publicPeriod = (
  period: Awaited<ReturnType<typeof resolveReportPeriod>>
) => ({
  dateFrom: period.dateFrom,
  dateTo: period.dateTo,
  preset: period.preset,
  today: period.today,
});

export const reportsRouter = {
  budgetPerformance: orgProcedure
    .use(requirePermission({ budget: ["read"], transaction: ["read"] }))
    .input(periodValues)
    .handler(async ({ context, input }) => {
      const period = await resolveReportPeriod(
        context.db,
        context.organizationId,
        input
      );
      const report = await getBudgetPerformance(
        context.db,
        context.organizationId,
        {
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        }
      );
      return {
        ...report,
        defaultCurrency: period.defaultCurrency,
        period: publicPeriod(period),
      };
    }),

  cashFlow: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(ledgerRangeValues)
    .handler(async ({ context, input }) => {
      const period = await resolveReportPeriod(
        context.db,
        context.organizationId,
        input
      );
      const report = await getCashFlow(context.db, context.organizationId, {
        accountIds: input.accountIds,
        dateFrom: period.dateFrom,
        dateTo: period.dateTo,
      });
      return {
        ...report,
        defaultCurrency: period.defaultCurrency,
        period: publicPeriod(period),
      };
    }),

  consolidatedNetWorth: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .handler(({ context }) =>
      getConsolidatedNetWorth(context.db, context.organizationId)
    ),

  netWorth: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .handler(({ context }) => getNetWorth(context.db, context.organizationId)),

  netWorthHistory: orgProcedure
    .use(
      requirePermission({ financialAccount: ["read"], transaction: ["read"] })
    )
    .input(historyValues)
    .handler(async ({ context, input }) => {
      const period = await resolveReportPeriod(
        context.db,
        context.organizationId,
        input
      );
      const history = await getNetWorthHistory(
        context.db,
        context.organizationId,
        period,
        input.granularity
      );
      return {
        ...history,
        defaultCurrency: period.defaultCurrency,
        period: publicPeriod(period),
      };
    }),

  period: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(periodValues)
    .handler(async ({ context, input }) => {
      const period = await resolveReportPeriod(
        context.db,
        context.organizationId,
        input
      );
      return {
        ...publicPeriod(period),
        defaultCurrency: period.defaultCurrency,
        timezone: period.timezone,
      };
    }),

  spendingByCategory: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(ledgerRangeValues)
    .handler(async ({ context, input }) => {
      const period = await resolveReportPeriod(
        context.db,
        context.organizationId,
        input
      );
      const report = await getSpendingByCategory(
        context.db,
        context.organizationId,
        {
          accountIds: input.accountIds,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        }
      );
      return {
        ...report,
        defaultCurrency: period.defaultCurrency,
        period: publicPeriod(period),
      };
    }),

  spendingByTag: orgProcedure
    .use(requirePermission({ transaction: ["read"] }))
    .input(ledgerRangeValues)
    .handler(async ({ context, input }) => {
      const period = await resolveReportPeriod(
        context.db,
        context.organizationId,
        input
      );
      const report = await getSpendingByTag(
        context.db,
        context.organizationId,
        {
          accountIds: input.accountIds,
          dateFrom: period.dateFrom,
          dateTo: period.dateTo,
        }
      );
      return {
        ...report,
        defaultCurrency: period.defaultCurrency,
        period: publicPeriod(period),
      };
    }),
};
