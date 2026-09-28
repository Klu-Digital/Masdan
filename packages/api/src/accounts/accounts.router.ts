import { cardCatalog } from "@masdan/card-catalog/all";
import { CARD_PRODUCT_KEY_PATTERN } from "@masdan/card-catalog/catalog";
import type { Database } from "@masdan/db";
import {
  creditCardStatement,
  currency,
  financialAccount,
  financialAccountBalanceSnapshot,
  financialAccountOwner,
  financialTransaction,
  member,
  organization,
} from "@masdan/db/schema/index";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { TAILWIND_COLORS } from "../colors";
import {
  orgMutationProcedure,
  orgProcedure,
  requirePermission,
} from "../procedures";
import { enqueueReminderRefresh } from "../reminders/reminders.router";
import { getAccountBalance, getAccountBalances } from "./balances";
import {
  ACCOUNT_CLASSES,
  ACCOUNT_TYPES,
  ASSET_ACCOUNT_TYPES,
  LIABILITY_ACCOUNT_TYPES,
  LIQUIDITY_TYPES,
  SNAPSHOT_SOURCES,
} from "./constants";

const accountFields = {
  accountClass: financialAccount.accountClass,
  accountType: financialAccount.accountType,
  archivedAt: financialAccount.archivedAt,
  cardLastFour: financialAccount.cardLastFour,
  cardNetwork: financialAccount.cardNetwork,
  cardProductKey: financialAccount.cardProductKey,
  color: financialAccount.color,
  createdAt: financialAccount.createdAt,
  creditLimit: financialAccount.creditLimit,
  currencyCode: financialAccount.currencyCode,
  icon: financialAccount.icon,
  id: financialAccount.id,
  includeInNetWorth: financialAccount.includeInNetWorth,
  institution: financialAccount.institution,
  liquidity: financialAccount.liquidity,
  name: financialAccount.name,
  notes: financialAccount.notes,
  openingBalance: financialAccount.openingBalance,
  openingBalanceDate: financialAccount.openingBalanceDate,
  organizationId: financialAccount.organizationId,
  paymentDueDay: financialAccount.paymentDueDay,
  statementClosingDay: financialAccount.statementClosingDay,
  updatedAt: financialAccount.updatedAt,
};

const accountIdInput = z.object({ accountId: z.uuid() });
const decimalPattern = /^-?\d+(?<fraction>\.\d{1,6})?$/u;
const nonNegativeDecimalPattern = /^\d+(?<fraction>\.\d{1,6})?$/u;
const isoDate = z.iso.date();
const MONEY_SCALE = 1_000_000n;

const scaledMoney = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = value.replace("-", "").split(".");
  const scaled = BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(6, "0"));
  return negative ? -scaled : scaled;
};

const moneyFromScaled = (value: bigint): string => {
  const absolute = value < 0 ? -value : value;
  const whole = absolute / MONEY_SCALE;
  const fraction = (absolute % MONEY_SCALE).toString().padStart(6, "0");
  return `${value < 0 ? "-" : ""}${whole}.${fraction}`;
};

const creditMetrics = (
  account: { accountType: string; creditLimit: string | null },
  balance: string
): { availableCredit: string | null; utilization: string | null } => {
  if (account.accountType !== "credit_card" || account.creditLimit === null) {
    return { availableCredit: null, utilization: null };
  }

  const limit = scaledMoney(account.creditLimit);
  const outstanding = scaledMoney(balance);
  const availableCredit = moneyFromScaled(limit - outstanding);
  if (limit <= 0) {
    return { availableCredit, utilization: null };
  }

  const utilizationHundredths =
    ((outstanding > 0 ? outstanding : 0n) * 10_000n + limit / 2n) / limit;
  return {
    availableCredit,
    utilization: `${utilizationHundredths / 100n}.${(
      utilizationHundredths % 100n
    )
      .toString()
      .padStart(2, "0")}`,
  };
};

const accountValues = z
  .object({
    accountClass: z.enum(ACCOUNT_CLASSES),
    accountType: z.enum(ACCOUNT_TYPES),
    cardLastFour: z
      .string()
      .trim()
      .regex(/^\d{4}$/u, "Use the last four digits")
      .nullable()
      .optional(),
    cardNetwork: z.string().trim().max(40).nullable().optional(),
    cardProductKey: z
      .string()
      .trim()
      .max(80)
      .regex(CARD_PRODUCT_KEY_PATTERN, "Choose a card from the list")
      .nullable()
      .optional(),
    color: z.enum(TAILWIND_COLORS).nullable().optional(),
    creditLimit: z
      .string()
      .trim()
      .regex(nonNegativeDecimalPattern, "Use a non-negative amount")
      .nullable()
      .optional(),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/u, "Use a three-letter currency code")
      .optional(),
    icon: z.string().trim().max(80).nullable().optional(),
    includeInNetWorth: z.boolean().default(true),
    institution: z.string().trim().max(120).nullable().optional(),
    liquidity: z.enum(LIQUIDITY_TYPES).nullable().optional(),
    name: z.string().trim().min(1, "Name is required").max(120),
    notes: z.string().trim().max(2000).nullable().optional(),
    openingBalance: z
      .string()
      .trim()
      .regex(decimalPattern, "Use a valid amount")
      .default("0"),
    openingBalanceDate: isoDate.optional(),
    ownerMemberIds: z
      .array(z.uuid())
      .max(20)
      .default([])
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate owner"),
    paymentDueDay: z.number().int().min(1).max(31).nullable().optional(),
    statementClosingDay: z.number().int().min(1).max(31).nullable().optional(),
  })
  .superRefine((value, context) => {
    const assetType = ASSET_ACCOUNT_TYPES.includes(
      value.accountType as (typeof ASSET_ACCOUNT_TYPES)[number]
    );
    const liabilityType = LIABILITY_ACCOUNT_TYPES.includes(
      value.accountType as (typeof LIABILITY_ACCOUNT_TYPES)[number]
    );

    if (value.accountClass === "asset" && !assetType) {
      context.addIssue({
        code: "custom",
        message: "Choose an asset account type",
        path: ["accountType"],
      });
    }
    if (value.accountClass === "liability" && !liabilityType) {
      context.addIssue({
        code: "custom",
        message: "Choose a liability account type",
        path: ["accountType"],
      });
    }
    if (
      value.accountClass === "liability" &&
      value.liquidity !== null &&
      value.liquidity !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Liability accounts cannot have a liquidity classification",
        path: ["liquidity"],
      });
    }

    const cardFields = [
      value.cardLastFour,
      value.cardNetwork,
      value.cardProductKey,
      value.creditLimit,
      value.paymentDueDay,
      value.statementClosingDay,
    ];
    if (
      value.accountType !== "credit_card" &&
      cardFields.some((field) => field !== null && field !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Card metadata requires a credit-card account",
        path: ["accountType"],
      });
    }
  });

type AccountValues = z.output<typeof accountValues>;

const cardMetadata = (values: AccountValues) =>
  values.accountType === "credit_card"
    ? {
        cardLastFour: values.cardLastFour ?? null,
        cardNetwork: values.cardNetwork ?? null,
        cardProductKey: values.cardProductKey ?? null,
        creditLimit: values.creditLimit ?? null,
        paymentDueDay: values.paymentDueDay ?? null,
        statementClosingDay: values.statementClosingDay ?? null,
      }
    : {
        cardLastFour: null,
        cardNetwork: null,
        cardProductKey: null,
        creditLimit: null,
        paymentDueDay: null,
        statementClosingDay: null,
      };

const assertCardProduct = (
  metadata: ReturnType<typeof cardMetadata>,
  institution: string | null | undefined,
  savedProductKey: string | null
): void => {
  const issue = cardCatalog.productIssue(
    { ...metadata, institution },
    savedProductKey
  );
  if (issue) {
    throw new ORPCError("BAD_REQUEST", { message: issue });
  }
};

const statementValues = z
  .object({
    accountId: z.uuid(),
    dueDate: isoDate.nullable().optional(),
    minimumAmountDue: z
      .string()
      .trim()
      .regex(nonNegativeDecimalPattern, "Use a non-negative amount")
      .nullable()
      .optional(),
    periodEnd: isoDate,
    periodStart: isoDate,
    statementBalance: z
      .string()
      .trim()
      .regex(decimalPattern, "Use a valid amount"),
    statementDate: isoDate,
  })
  .superRefine((value, context) => {
    if (value.periodStart > value.periodEnd) {
      context.addIssue({
        code: "custom",
        message: "Statement period must end on or after it starts",
        path: ["periodEnd"],
      });
    }
  });

const statementFields = {
  accountId: creditCardStatement.accountId,
  createdAt: creditCardStatement.createdAt,
  dueDate: creditCardStatement.dueDate,
  id: creditCardStatement.id,
  minimumAmountDue: creditCardStatement.minimumAmountDue,
  organizationId: creditCardStatement.organizationId,
  periodEnd: creditCardStatement.periodEnd,
  periodStart: creditCardStatement.periodStart,
  statementBalance: creditCardStatement.statementBalance,
  statementDate: creditCardStatement.statementDate,
  updatedAt: creditCardStatement.updatedAt,
};

const snapshotValues = z.object({
  accountId: z.uuid(),
  balance: z.string().trim().regex(decimalPattern, "Use a valid amount"),
  effectiveDate: isoDate,
  importReference: z.string().trim().max(200).nullable().optional(),
  source: z.enum(SNAPSHOT_SOURCES).default("manual"),
});

const accountNotFound = () =>
  new ORPCError("NOT_FOUND", { message: "Financial account not found" });

const requireCreditCard = async (
  db: Database,
  organizationId: string,
  accountId: string
): Promise<void> => {
  const [account] = await db
    .select({ accountType: financialAccount.accountType })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.id, accountId),
        eq(financialAccount.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!account || account.accountType !== "credit_card") {
    throw accountNotFound();
  }
};

const validateOwners = async (
  db: Database,
  organizationId: string,
  ownerMemberIds: string[]
): Promise<void> => {
  if (ownerMemberIds.length === 0) {
    return;
  }

  const owners = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        inArray(member.id, ownerMemberIds)
      )
    );

  if (owners.length !== ownerMemberIds.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Every account owner must belong to the active household",
    });
  }
};

export const accountsRouter = {
  archive: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["archive"] }))
    .input(accountIdInput)
    .handler(async ({ context, input }) => {
      const [archived] = await context.db
        .update(financialAccount)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(financialAccount.id, input.accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .returning(accountFields);

      if (!archived) {
        throw accountNotFound();
      }
      const balance = await getAccountBalance(context.db, archived.id);
      return {
        ...archived,
        balance,
        ...creditMetrics(archived, balance),
      };
    }),

  create: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["create"] }))
    .input(accountValues)
    .handler(async ({ context, input }) => {
      await validateOwners(
        context.db,
        context.organizationId,
        input.ownerMemberIds
      );

      const [household] = await context.db
        .select({ defaultCurrency: organization.defaultCurrency })
        .from(organization)
        .where(eq(organization.id, context.organizationId))
        .limit(1);
      const currencyCode = input.currencyCode ?? household?.defaultCurrency;
      if (!currencyCode) {
        throw new ORPCError("NOT_FOUND", { message: "Household not found" });
      }

      const [selectedCurrency] = await context.db
        .select({ code: currency.code })
        .from(currency)
        .where(and(eq(currency.code, currencyCode), eq(currency.enabled, true)))
        .limit(1);
      if (!selectedCurrency) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Unknown currency ${currencyCode}`,
        });
      }

      const card = cardMetadata(input);
      assertCardProduct(card, input.institution, null);

      const { ownerMemberIds, currencyCode: _, ...values } = input;
      const [created] = await context.db
        .insert(financialAccount)
        .values({
          ...values,
          ...card,
          currencyCode: selectedCurrency.code,
          organizationId: context.organizationId,
        })
        .returning(accountFields);

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create financial account",
        });
      }

      if (ownerMemberIds.length > 0) {
        await context.db.insert(financialAccountOwner).values(
          ownerMemberIds.map((memberId) => ({
            financialAccountId: created.id,
            memberId,
          }))
        );
      }
      if (created.accountType === "credit_card") {
        await enqueueReminderRefresh(context.db, context.organizationId);
      }

      return {
        ...created,
        balance: created.openingBalance,
        ...creditMetrics(created, created.openingBalance),
        ownerMemberIds,
      };
    }),

  createStatement: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(statementValues)
    .handler(async ({ context, input }) => {
      await requireCreditCard(
        context.db,
        context.organizationId,
        input.accountId
      );

      const [created] = await context.db
        .insert(creditCardStatement)
        .values({
          ...input,
          dueDate: input.dueDate ?? null,
          minimumAmountDue: input.minimumAmountDue ?? null,
          organizationId: context.organizationId,
        })
        .returning(statementFields);
      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not create credit card statement",
        });
      }
      await enqueueReminderRefresh(context.db, context.organizationId);
      return created;
    }),

  get: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(accountIdInput)
    .handler(async ({ context, input }) => {
      const [account] = await context.db
        .select(accountFields)
        .from(financialAccount)
        .where(
          and(
            eq(financialAccount.id, input.accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .limit(1);

      if (!account) {
        throw accountNotFound();
      }

      const owners = await context.db
        .select({ memberId: financialAccountOwner.memberId })
        .from(financialAccountOwner)
        .where(eq(financialAccountOwner.financialAccountId, account.id));

      const balance = await getAccountBalance(context.db, account.id);
      return {
        ...account,
        balance,
        ...creditMetrics(account, balance),
        ownerMemberIds: owners.map(({ memberId }) => memberId),
      };
    }),

  list: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .handler(async ({ context, input }) => {
      const conditions = [
        eq(financialAccount.organizationId, context.organizationId),
      ];
      if (!input?.includeArchived) {
        conditions.push(isNull(financialAccount.archivedAt));
      }

      const accounts = await context.db
        .select(accountFields)
        .from(financialAccount)
        .where(and(...conditions))
        .orderBy(
          asc(financialAccount.accountClass),
          asc(financialAccount.name)
        );
      const owners = accounts.length
        ? await context.db
            .select({
              accountId: financialAccountOwner.financialAccountId,
              memberId: financialAccountOwner.memberId,
            })
            .from(financialAccountOwner)
            .where(
              inArray(
                financialAccountOwner.financialAccountId,
                accounts.map((account) => account.id)
              )
            )
        : [];
      const ownerMemberIds = new Map<string, string[]>();
      for (const owner of owners) {
        const memberIds = ownerMemberIds.get(owner.accountId) ?? [];
        memberIds.push(owner.memberId);
        ownerMemberIds.set(owner.accountId, memberIds);
      }

      const balances = await getAccountBalances(
        context.db,
        accounts.map((account) => account.id)
      );

      return accounts.map((account) => {
        const balance = balances.get(account.id) ?? account.openingBalance;
        return {
          ...account,
          balance,
          ...creditMetrics(account, balance),
          ownerMemberIds: ownerMemberIds.get(account.id) ?? [],
        };
      });
    }),

  listSnapshots: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(accountIdInput)
    .handler(async ({ context, input }) => {
      const [account] = await context.db
        .select({ id: financialAccount.id })
        .from(financialAccount)
        .where(
          and(
            eq(financialAccount.id, input.accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .limit(1);
      if (!account) {
        throw accountNotFound();
      }

      return context.db
        .select()
        .from(financialAccountBalanceSnapshot)
        .where(eq(financialAccountBalanceSnapshot.accountId, input.accountId))
        .orderBy(
          desc(financialAccountBalanceSnapshot.effectiveDate),
          desc(financialAccountBalanceSnapshot.createdAt)
        );
    }),

  listStatements: orgProcedure
    .use(requirePermission({ financialAccount: ["read"] }))
    .input(accountIdInput)
    .handler(async ({ context, input }) => {
      await requireCreditCard(
        context.db,
        context.organizationId,
        input.accountId
      );

      return context.db
        .select(statementFields)
        .from(creditCardStatement)
        .where(
          and(
            eq(creditCardStatement.accountId, input.accountId),
            eq(creditCardStatement.organizationId, context.organizationId)
          )
        )
        .orderBy(
          desc(creditCardStatement.statementDate),
          desc(creditCardStatement.createdAt)
        );
    }),

  restore: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["restore"] }))
    .input(accountIdInput)
    .handler(async ({ context, input }) => {
      const [restored] = await context.db
        .update(financialAccount)
        .set({ archivedAt: null })
        .where(
          and(
            eq(financialAccount.id, input.accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .returning(accountFields);

      if (!restored) {
        throw accountNotFound();
      }
      if (restored.accountType === "credit_card") {
        await enqueueReminderRefresh(context.db, context.organizationId);
      }
      const balance = await getAccountBalance(context.db, restored.id);
      return {
        ...restored,
        balance,
        ...creditMetrics(restored, balance),
      };
    }),

  saveSnapshot: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(snapshotValues)
    .handler(async ({ context, input }) => {
      const [account] = await context.db
        .select({ id: financialAccount.id })
        .from(financialAccount)
        .where(
          and(
            eq(financialAccount.id, input.accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .limit(1);
      if (!account) {
        throw accountNotFound();
      }

      const [snapshot] = await context.db
        .insert(financialAccountBalanceSnapshot)
        .values(input)
        .returning();
      if (!snapshot) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Could not save balance snapshot",
        });
      }
      return snapshot;
    }),

  update: orgMutationProcedure
    .use(requirePermission({ financialAccount: ["update"] }))
    .input(accountValues.extend({ accountId: z.uuid() }))
    .handler(async ({ context, input }) => {
      await validateOwners(
        context.db,
        context.organizationId,
        input.ownerMemberIds
      );

      const {
        accountId,
        ownerMemberIds,
        currencyCode: requestedCurrency,
        ...values
      } = input;
      const [existing] = await context.db
        .select({
          accountClass: financialAccount.accountClass,
          accountType: financialAccount.accountType,
          cardProductKey: financialAccount.cardProductKey,
          currencyCode: financialAccount.currencyCode,
        })
        .from(financialAccount)
        .where(
          and(
            eq(financialAccount.id, accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .limit(1);
      if (!existing) {
        throw accountNotFound();
      }
      const card = cardMetadata(input);
      assertCardProduct(card, input.institution, existing.cardProductKey);

      const currencyCode = requestedCurrency ?? existing.currencyCode;
      const [selectedCurrency] = await context.db
        .select({ code: currency.code, enabled: currency.enabled })
        .from(currency)
        .where(eq(currency.code, currencyCode))
        .limit(1);
      if (
        !selectedCurrency ||
        (!selectedCurrency.enabled &&
          selectedCurrency.code !== existing.currencyCode)
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Unknown currency ${currencyCode}`,
        });
      }

      if (
        existing.accountClass !== input.accountClass ||
        existing.accountType !== input.accountType ||
        existing.currencyCode !== selectedCurrency.code
      ) {
        const postings = await context.db
          .select({ id: financialTransaction.id })
          .from(financialTransaction)
          .where(eq(financialTransaction.accountId, accountId))
          .limit(1);
        const statements = postings.length
          ? []
          : await context.db
              .select({ id: creditCardStatement.id })
              .from(creditCardStatement)
              .where(eq(creditCardStatement.accountId, accountId))
              .limit(1);
        const snapshots =
          postings.length || statements.length
            ? []
            : await context.db
                .select({ id: financialAccountBalanceSnapshot.id })
                .from(financialAccountBalanceSnapshot)
                .where(eq(financialAccountBalanceSnapshot.accountId, accountId))
                .limit(1);
        if (postings.length || statements.length || snapshots.length) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Account class, type, and currency cannot change after financial history exists",
          });
        }
      }

      const [updated] = await context.db
        .update(financialAccount)
        .set({
          ...values,
          ...card,
          currencyCode: selectedCurrency.code,
        })
        .where(
          and(
            eq(financialAccount.id, accountId),
            eq(financialAccount.organizationId, context.organizationId)
          )
        )
        .returning(accountFields);
      if (!updated) {
        throw accountNotFound();
      }

      await context.db
        .delete(financialAccountOwner)
        .where(eq(financialAccountOwner.financialAccountId, accountId));
      if (ownerMemberIds.length > 0) {
        await context.db.insert(financialAccountOwner).values(
          ownerMemberIds.map((memberId) => ({
            financialAccountId: accountId,
            memberId,
          }))
        );
      }
      if (updated.accountType === "credit_card") {
        await enqueueReminderRefresh(context.db, context.organizationId);
      }

      const balance = await getAccountBalance(context.db, updated.id);
      return {
        ...updated,
        balance,
        ...creditMetrics(updated, balance),
        ownerMemberIds,
      };
    }),
};
