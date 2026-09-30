import type { Faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { Factory } from "fishery";

import type { Database } from "../../../index";
import { member, organization } from "../../../schema/auth";
import { categoryBudget } from "../../../schema/budgets";
import { category } from "../../../schema/categories";
import {
  creditCardStatement,
  financialAccount,
  financialAccountOwner,
} from "../../../schema/financial-accounts";
import { savingsGoal } from "../../../schema/goals";
import { transactionRule, transactionRuleTag } from "../../../schema/rules";
import { tag } from "../../../schema/tags";
import {
  financialTransaction,
  financialTransactionTag,
  financialTransfer,
  recurringSchedule,
} from "../../../schema/transactions";

const expenses = [
  {
    budget: "20000",
    category: "Housing",
    max: 18_000,
    merchant: "Rent",
    min: 14_000,
  },
  {
    budget: "11000",
    category: "Groceries",
    max: 3000,
    merchant: "Supermarket",
    min: 1200,
  },
  {
    budget: "5000",
    category: "Food & Dining",
    max: 950,
    merchant: "Coffee and lunch",
    min: 300,
  },
  {
    budget: "3500",
    category: "Transport",
    max: 900,
    merchant: "Commute",
    min: 200,
  },
  {
    budget: "4000",
    category: "Utilities",
    max: 3200,
    merchant: "Electricity and internet",
    min: 1800,
  },
  {
    budget: "4500",
    category: "Entertainment",
    max: 1200,
    merchant: "Movies and streaming",
    min: 400,
  },
] as const;

/** The sign-up hook owns categories; seed a ledger around those real household rows. */
export const seedFinances = async (
  db: Database,
  userId: string,
  faker: Faker
): Promise<void> => {
  const [household] = await db
    .select({ currency: organization.defaultCurrency, id: organization.id })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId));
  if (!household) {
    throw new Error(`No household for seeded user ${userId}`);
  }

  const categories = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.organizationId, household.id));
  const categoryIds = new Map(categories.map((row) => [row.name, row.id]));
  const categoryId = (name: string): string => {
    const id = categoryIds.get(name);
    if (!id) {
      throw new Error(
        `Missing default category ${name} for household ${household.id}`
      );
    }
    return id;
  };

  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const openingDate = new Date(Date.UTC(year, month - 11, 1))
    .toISOString()
    .slice(0, 10);
  const accountFactory = Factory.define<typeof financialAccount.$inferInsert>(
    () => ({
      accountClass: "asset",
      accountType: "bank",
      currencyCode: household.currency,
      name: "Checking",
      openingBalance: "12000",
      openingBalanceDate: openingDate,
      organizationId: household.id,
    })
  );
  const accounts = await db
    .insert(financialAccount)
    .values([
      accountFactory.build({ institution: "BDO", name: "Everyday checking" }),
      accountFactory.build({
        accountType: "e_wallet",
        institution: "GCash",
        name: "Everyday wallet",
        openingBalance: "2500",
      }),
      accountFactory.build({
        accountClass: "liability",
        accountType: "credit_card",
        creditLimit: "100000",
        institution: "BPI",
        name: "Rewards card",
        openingBalance: "0",
        paymentDueDay: 20,
        statementClosingDay: 5,
      }),
    ])
    .returning({ id: financialAccount.id });
  const [checking, wallet, card] = accounts;
  if (!(checking && wallet && card)) {
    throw new Error("Seed accounts were not created");
  }
  const [owner] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId));
  if (!owner) {
    throw new Error(`No membership for seeded user ${userId}`);
  }
  await db.insert(financialAccountOwner).values(
    accounts.map((account) => ({
      financialAccountId: account.id,
      memberId: owner.id,
      organizationId: household.id,
    }))
  );
  const [essentials, leisure] = await db
    .insert(tag)
    .values([
      { color: "blue", name: "Essentials", organizationId: household.id },
      { color: "purple", name: "Leisure", organizationId: household.id },
    ])
    .returning({ id: tag.id });
  if (!(essentials && leisure)) {
    throw new Error("Seed tags were not created");
  }
  const [groceriesRule] = await db
    .insert(transactionRule)
    .values({
      matchText: "Supermarket",
      matchTextOperator: "contains",
      name: "Supermarket groceries",
      organizationId: household.id,
      position: 0,
      setCategoryId: categoryId("Groceries"),
    })
    .returning({ id: transactionRule.id });
  if (groceriesRule) {
    await db.insert(transactionRuleTag).values({
      organizationId: household.id,
      ruleId: groceriesRule.id,
      tagId: essentials.id,
    });
  }
  await db.insert(savingsGoal).values({
    accountId: checking.id,
    name: "Emergency fund",
    organizationId: household.id,
    targetAmount: "250000",
    targetDate: new Date(Date.UTC(year + 1, month, 1))
      .toISOString()
      .slice(0, 10),
  });

  const transactionFactory = Factory.define<
    typeof financialTransaction.$inferInsert
  >(() => ({
    accountId: checking.id,
    amount: "65000",
    categoryId: categoryId("Salary"),
    currencyCode: household.currency,
    organizationId: household.id,
    transactionDate: openingDate,
  }));
  const budgetFactory = Factory.define<typeof categoryBudget.$inferInsert>(
    () => ({
      amount: "5000",
      categoryId: categoryId("Food & Dining"),
      currencyCode: household.currency,
      month: openingDate,
      organizationId: household.id,
    })
  );

  let lastStatementBalance = "0";
  for (let offset = -11; offset <= 0; offset += 1) {
    const first = new Date(Date.UTC(year, month + offset, 1));
    const monthStart = first.toISOString().slice(0, 10);
    const lastDay = offset === 0 ? Math.min(today.getUTCDate(), 27) : 27;
    const onDay = (day: number): string =>
      `${monthStart.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;

    const transactions = [
      transactionFactory.build({
        notes: "Monthly pay",
        transactionDate: onDay(1),
      }),
      ...expenses.flatMap((expense, index) => {
        let accountId = checking.id;
        if (index === 3) {
          accountId = wallet.id;
        } else if (index === 5) {
          accountId = card.id;
        }
        return Array.from(
          { length: index === 0 || index === 4 ? 1 : 5 },
          (_, visit) =>
            transactionFactory.build({
              accountId,
              amount: String(
                faker.number.int({ max: expense.max, min: expense.min })
              ),
              categoryId: categoryId(expense.category),
              notes: expense.merchant,
              transactionDate: onDay(5 + visit * 5 + (index % 3)),
            })
        );
      }),
    ];
    if (offset === -1) {
      lastStatementBalance = String(
        transactions
          .filter((row) => row.accountId === card.id)
          .reduce((sum, row) => sum + Number(row.amount), 0)
      );
    }
    const inserted = await db
      .insert(financialTransaction)
      .values(transactions)
      .returning({ id: financialTransaction.id });
    await db.insert(financialTransactionTag).values(
      inserted.slice(1).map((row, index) => ({
        organizationId: household.id,
        tagId: index >= 17 ? leisure.id : essentials.id,
        transactionId: row.id,
      }))
    );

    await db.insert(categoryBudget).values(
      expenses.map((expense) =>
        budgetFactory.build({
          amount: expense.budget,
          categoryId: categoryId(expense.category),
          month: monthStart,
        })
      )
    );

    const [transfer] = await db
      .insert(financialTransfer)
      .values({
        destinationAccountId: wallet.id,
        destinationAmount: "3000",
        notes: "Top up wallet",
        organizationId: household.id,
        sourceAccountId: checking.id,
        sourceAmount: "3000",
        transactionDate: onDay(2),
      })
      .returning({ id: financialTransfer.id });
    if (transfer) {
      await db.insert(financialTransaction).values([
        transactionFactory.build({
          accountId: checking.id,
          amount: "3000",
          categoryId: null,
          notes: "Top up wallet",
          transactionDate: onDay(2),
          transferId: transfer.id,
          transferSide: "source",
        }),
        transactionFactory.build({
          accountId: wallet.id,
          amount: "3000",
          categoryId: null,
          notes: "Top up wallet",
          transactionDate: onDay(2),
          transferId: transfer.id,
          transferSide: "destination",
        }),
      ]);
    }
  }
  const nextMonth = new Date(Date.UTC(year, month + 1, 1))
    .toISOString()
    .slice(0, 10);
  await db.insert(recurringSchedule).values([
    {
      accountId: checking.id,
      amount: "16000",
      categoryId: categoryId("Housing"),
      frequency: "monthly",
      name: "Rent",
      nextOccurrenceDate: `${nextMonth.slice(0, 8)}05`,
      organizationId: household.id,
      startDate: openingDate,
    },
    {
      accountId: checking.id,
      amount: "2500",
      categoryId: categoryId("Utilities"),
      frequency: "monthly",
      name: "Electricity and internet",
      nextOccurrenceDate: `${nextMonth.slice(0, 8)}10`,
      organizationId: household.id,
      startDate: openingDate,
    },
  ]);
  const previousMonth = new Date(Date.UTC(year, month - 1, 1))
    .toISOString()
    .slice(0, 10);
  await db.insert(creditCardStatement).values({
    accountId: card.id,
    dueDate: `${today.toISOString().slice(0, 8)}20`,
    minimumAmountDue: "500",
    organizationId: household.id,
    periodEnd: `${previousMonth.slice(0, 8)}27`,
    periodStart: previousMonth,
    statementBalance: lastStatementBalance,
    statementDate: `${previousMonth.slice(0, 8)}28`,
  });
};
