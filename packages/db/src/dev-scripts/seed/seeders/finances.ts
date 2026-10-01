import type { Faker } from "@faker-js/faker";
import { cardCatalog } from "@masdan/card-catalog/all";
import { cardNetworkLabel } from "@masdan/card-catalog/catalog";
import { and, eq } from "drizzle-orm";
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
import { financialInstitution } from "../../../schema/institutions";
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
    budget: "22000",
    category: "Housing",
    max: 20_000,
    min: 18_000,
    notes: ["Condo rent — monthly lease", "Apartment rent including parking"],
    tags: ["Essentials", "Home"],
    visits: 1,
  },
  {
    budget: "15000",
    category: "Groceries",
    max: 3000,
    min: 1200,
    notes: [
      "SM Supermarket — weekly pantry restock",
      "Puregold — rice and cleaning supplies",
      "Landers — bulk groceries",
      "Weekend palengke — fruit and vegetables",
      "Robinsons Supermarket — breakfast staples",
    ],
    tags: ["Essentials", "Home"],
    visits: 5,
  },
  {
    budget: "8000",
    category: "Food & Dining",
    max: 1400,
    min: 250,
    notes: [
      "Wildflour — brunch with friends",
      "Jollibee — quick lunch",
      "Toby's Estate — coffee before work",
      "GrabFood — dinner after overtime",
      "Ramen Nagi — date night",
      "Office lunch at the carinderia",
    ],
    tags: ["Leisure", "Date night"],
    visits: 6,
  },
  {
    budget: "5000",
    category: "Transport",
    max: 900,
    min: 80,
    notes: [
      "GrabCar — ride to the office",
      "Autosweep RFID reload",
      "MRT and jeepney commute",
      "Shell — fuel for weekend errands",
      "Parking at BGC",
    ],
    tags: ["Essentials", "Work"],
    visits: 5,
  },
  {
    budget: "7000",
    category: "Utilities",
    max: 3000,
    min: 1200,
    notes: [
      "Meralco — electricity bill",
      "PLDT Fiber — home internet",
      "Globe — mobile plan",
      "Manila Water — water bill",
    ],
    tags: ["Essentials", "Home"],
    visits: 3,
  },
  {
    budget: "4000",
    category: "Entertainment",
    max: 1200,
    min: 200,
    notes: [
      "Netflix — family subscription",
      "Spotify Premium — monthly renewal",
      "Cinema tickets and popcorn",
      "Steam — game on sale",
      "Concert tickets with friends",
    ],
    tags: ["Leisure", "Subscriptions"],
    visits: 3,
  },
  {
    budget: "6000",
    category: "Shopping",
    max: 2500,
    min: 500,
    notes: [
      "Uniqlo — work shirts",
      "Shopee — desk accessories",
      "Lazada — replacement headphones",
      "National Book Store — journal and pens",
    ],
    tags: ["Online", "Personal"],
    visits: 2,
  },
  {
    budget: "4000",
    category: "Health",
    max: 2000,
    min: 400,
    notes: [
      "Mercury Drug — vitamins and medicine",
      "Dental cleaning and checkup",
      "Annual lab tests",
      "Watsons — first-aid supplies",
    ],
    tags: ["Essentials", "Personal"],
    visits: 2,
  },
  {
    budget: "10000",
    category: "Travel",
    max: 7000,
    min: 1500,
    notes: [
      "Cebu Pacific — seat-sale booking",
      "Tagaytay — overnight accommodation",
      "Batangas — beach resort deposit",
      "Agoda — hotel for family trip",
    ],
    tags: ["Leisure", "Vacation"],
    visits: 1,
  },
  {
    budget: "3000",
    category: "Education",
    max: 2000,
    min: 500,
    notes: [
      "Udemy — professional development course",
      "Fully Booked — reference books",
      "Weekend language class",
    ],
    tags: ["Work", "Personal"],
    visits: 1,
  },
  {
    budget: "4000",
    category: "Gifts & Donations",
    max: 2500,
    min: 500,
    notes: [
      "Birthday gift for Mom",
      "Donation to the community pantry",
      "Wedding gift for a friend",
      "Family reunion contribution",
    ],
    tags: ["Family", "Celebration"],
    visits: 1,
  },
  {
    budget: "2500",
    category: "Pets",
    max: 1800,
    min: 600,
    notes: [
      "Pet Express — kibble and treats",
      "Vet visit and vaccinations",
      "Cat litter delivery",
    ],
    tags: ["Home", "Essentials"],
    visits: 1,
  },
  {
    budget: "2500",
    category: "Fitness",
    max: 2000,
    min: 500,
    notes: [
      "Gym membership renewal",
      "Weekend yoga class",
      "Badminton court with friends",
    ],
    tags: ["Personal", "Leisure"],
    visits: 1,
  },
] as const;

const seedTags = [
  { color: "blue", name: "Essentials" },
  { color: "purple", name: "Leisure" },
  { color: "amber", name: "Home" },
  { color: "indigo", name: "Work" },
  { color: "pink", name: "Date night" },
  { color: "violet", name: "Subscriptions" },
  { color: "cyan", name: "Online" },
  { color: "teal", name: "Personal" },
  { color: "sky", name: "Vacation" },
  { color: "orange", name: "Family" },
  { color: "rose", name: "Celebration" },
  { color: "emerald", name: "Income" },
] as const;

const cardKeys = [
  "ph-metrobank-world-mastercard",
  "ph-hsbc-live-plus-visa-signature",
  "ph-zed-titanium-mastercard",
  "ph-rcbc-black-card-platinum-mastercard",
] as const;

/** The sign-up hook owns categories; seed around those real household rows. */
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
  if (!household || household.currency !== "PHP") {
    throw new Error(`Expected a PHP household for seeded user ${userId}`);
  }
  await db.insert(category).values(
    [
      { color: "indigo", icon: "📚", name: "Education", sortOrder: 130 },
      { color: "rose", icon: "🎁", name: "Gifts & Donations", sortOrder: 140 },
      { color: "amber", icon: "🐾", name: "Pets", sortOrder: 150 },
      { color: "teal", icon: "🏋️", name: "Fitness", sortOrder: 160 },
    ].map((row) => ({
      ...row,
      organizationId: household.id,
      type: "expense" as const,
    }))
  );
  const categories = await db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.organizationId, household.id));
  const categoryIds = new Map(categories.map((row) => [row.name, row.id]));
  const categoryId = (name: string): string => {
    const id = categoryIds.get(name);
    if (!id) {
      throw new Error(`Missing category ${name} for household ${household.id}`);
    }
    return id;
  };
  const institutions = await db.select().from(financialInstitution);
  const institutionPreset = (key: string) => {
    const preset = institutions.find((row) => row.key === key);
    if (!preset) {
      throw new Error(`Missing institution preset ${key}; run db:deploy first`);
    }
    return { institution: preset.name, institutionId: preset.id };
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
      currencyCode: "PHP",
      name: "Checking",
      openingBalance: "0",
      openingBalanceDate: openingDate,
      organizationId: household.id,
    })
  );
  const accounts = await db
    .insert(financialAccount)
    .values([
      accountFactory.build({
        ...institutionPreset("ph-bdo"),
        name: "BDO payroll and everyday banking",
        openingBalance: "300000",
      }),
      accountFactory.build({
        ...institutionPreset("ph-gcash"),
        accountType: "e_wallet",
        name: "GCash everyday wallet",
        openingBalance: "10000",
      }),
      accountFactory.build({
        ...institutionPreset("ph-bpi"),
        name: "BPI savings and emergency fund",
      }),
      ...cardKeys.map((key, index) => {
        const product = cardCatalog.findProduct(key);
        const issuer = product && cardCatalog.findIssuer(product.issuerKey);
        if (!product || !issuer) {
          throw new Error(`Missing card preset ${key}`);
        }
        return accountFactory.build({
          accountClass: "liability",
          accountType: "credit_card",
          cardLastFour: String(4101 + index),
          cardNetwork: cardNetworkLabel(product.network),
          cardProductKey: product.key,
          creditLimit: String(200_000 + index * 100_000),
          institution: issuer.name,
          name: cardCatalog.productName(product),
          paymentDueDay: 20,
          statementClosingDay: 28,
        });
      }),
    ])
    .returning({ id: financialAccount.id, name: financialAccount.name });
  const [checking, wallet, savings, ...cards] = accounts;
  if (!checking || !wallet || !savings || cards.length !== cardKeys.length) {
    throw new Error("Seed accounts were not created");
  }
  const [owner] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, household.id))
    );
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
  const tags = await db
    .insert(tag)
    .values(seedTags.map((row) => ({ ...row, organizationId: household.id })))
    .returning({ id: tag.id, name: tag.name });
  const tagId = (name: string): string => {
    const found = tags.find((row) => row.name === name);
    if (!found) {
      throw new Error(`Missing seed tag ${name}`);
    }
    return found.id;
  };
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
      tagId: tagId("Essentials"),
    });
  }
  await db.insert(savingsGoal).values({
    accountId: savings.id,
    name: "Emergency fund",
    organizationId: household.id,
    targetAmount: "2000000",
    targetDate: new Date(Date.UTC(year + 1, month, 1))
      .toISOString()
      .slice(0, 10),
  });

  const transactionFactory = Factory.define<
    typeof financialTransaction.$inferInsert
  >(() => ({
    accountId: checking.id,
    amount: "95000",
    categoryId: categoryId("Salary"),
    currencyCode: "PHP",
    organizationId: household.id,
    transactionDate: openingDate,
  }));
  const budgetFactory = Factory.define<typeof categoryBudget.$inferInsert>(
    () => ({
      amount: "5000",
      categoryId: categoryId("Food & Dining"),
      currencyCode: "PHP",
      month: openingDate,
      organizationId: household.id,
    })
  );
  let netMovement = 0;
  let previousStatementBalances = cards.map(() => 0);
  for (let offset = -11; offset <= 0; offset += 1) {
    const cardBalances = cards.map(() => 0);
    const openingStatementBalances = previousStatementBalances;
    const monthIndex = offset + 11;
    const monthStart = new Date(Date.UTC(year, month + offset, 1))
      .toISOString()
      .slice(0, 10);
    const lastDay = offset === 0 ? Math.min(today.getUTCDate(), 27) : 27;
    const onDay = (day: number): string =>
      `${monthStart.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
    const income = [
      transactionFactory.build({
        notes: faker.helpers.arrayElement([
          "Payroll — monthly salary",
          "Salary credited via BDO payroll",
          "Monthly compensation — net of deductions",
        ]),
        transactionDate: onDay(1),
      }),
      transactionFactory.build({
        amount: String(faker.number.int({ max: 20_000, min: 5000 })),
        categoryId: categoryId("Freelance"),
        notes: faker.helpers.arrayElement([
          "Website project — milestone payment",
          "Consulting invoice — retainer",
          "Design commission — final payment",
        ]),
        transactionDate: onDay(15),
      }),
      transactionFactory.build({
        accountId: savings.id,
        amount: String(faker.number.int({ max: 2200, min: 800 })),
        categoryId: categoryId("Interest Income"),
        notes: "BPI savings — interest credit, net of tax",
        transactionDate: onDay(27),
      }),
    ];
    const spending = expenses.flatMap((expense, index) =>
      Array.from({ length: expense.visits }, (_, visit) => {
        const cardIndex = (index + visit + monthIndex) % cards.length;
        const card = cards[cardIndex];
        if (!card) {
          throw new Error("Missing seed credit card");
        }
        let accountId = card.id;
        if (expense.category === "Transport") {
          accountId = wallet.id;
        } else if (
          expense.category === "Housing" ||
          expense.category === "Utilities"
        ) {
          accountId = checking.id;
        }
        const amount = faker.number.int({ max: expense.max, min: expense.min });
        if (accountId === card.id) {
          cardBalances[cardIndex] = (cardBalances[cardIndex] ?? 0) + amount;
        }
        return {
          row: transactionFactory.build({
            accountId,
            amount: String(amount),
            categoryId: categoryId(expense.category),
            notes: faker.helpers.arrayElement(expense.notes),
            transactionDate: onDay(5 + visit * 4 + (index % 3)),
          }),
          tags: expense.tags,
        };
      })
    );
    const transactions = [...income, ...spending.map(({ row }) => row)];
    netMovement +=
      income.reduce((sum, row) => sum + Number(row.amount), 0) -
      spending.reduce((sum, { row }) => sum + Number(row.amount), 0);
    const inserted = await db
      .insert(financialTransaction)
      .values(transactions)
      .returning({ id: financialTransaction.id });
    await db.insert(financialTransactionTag).values(
      inserted.flatMap((row, index) => {
        const names =
          index < income.length
            ? ["Income"]
            : (spending[index - income.length]?.tags ?? []);
        return names.map((name) => ({
          organizationId: household.id,
          tagId: tagId(name),
          transactionId: row.id,
        }));
      })
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

    const payments = [
      {
        accountId: wallet.id,
        amount: 6000,
        day: 2,
        notes: "GCash cash-in — monthly commute and errands",
      },
      ...cards.map((card, index) => ({
        accountId: card.id,
        amount: openingStatementBalances[index] ?? 0,
        day: 20,
        notes: `${card.name} — full payment of previous statement`,
      })),
    ];
    for (const payment of payments) {
      if (payment.amount === 0) {
        continue;
      }
      const [transfer] = await db
        .insert(financialTransfer)
        .values({
          destinationAccountId: payment.accountId,
          destinationAmount: String(payment.amount),
          notes: payment.notes,
          organizationId: household.id,
          sourceAccountId: checking.id,
          sourceAmount: String(payment.amount),
          transactionDate: onDay(payment.day),
        })
        .returning({ id: financialTransfer.id });
      if (!transfer) {
        throw new Error("Seed transfer was not created");
      }
      await db.insert(financialTransaction).values([
        transactionFactory.build({
          accountId: checking.id,
          amount: String(payment.amount),
          categoryId: null,
          notes: payment.notes,
          transactionDate: onDay(payment.day),
          transferId: transfer.id,
          transferSide: "source",
        }),
        transactionFactory.build({
          accountId: payment.accountId,
          amount: String(payment.amount),
          categoryId: null,
          notes: payment.notes,
          transactionDate: onDay(payment.day),
          transferId: transfer.id,
          transferSide: "destination",
        }),
      ]);
    }
    if (offset < 0) {
      const dueMonth = new Date(Date.UTC(year, month + offset + 1, 1))
        .toISOString()
        .slice(0, 8);
      await db.insert(creditCardStatement).values(
        cards.map((card, index) => ({
          accountId: card.id,
          dueDate: `${dueMonth}20`,
          minimumAmountDue: String(Math.min(cardBalances[index] ?? 0, 500)),
          organizationId: household.id,
          periodEnd: `${monthStart.slice(0, 8)}27`,
          periodStart: monthStart,
          statementBalance: String(cardBalances[index] ?? 0),
          statementDate: `${monthStart.slice(0, 8)}28`,
        }))
      );
      previousStatementBalances = [...cardBalances];
    }
  }
  const targetNetWorth = faker.number.float({
    fractionDigits: 2,
    max: 2_575_000,
    min: 2_425_000,
  });
  // Transfers cancel in net worth; offset income minus expenses, not card debt twice.
  await db
    .update(financialAccount)
    .set({
      openingBalance: (targetNetWorth - 310_000 - netMovement).toFixed(2),
    })
    .where(eq(financialAccount.id, savings.id));
  const nextMonth = new Date(Date.UTC(year, month + 1, 1))
    .toISOString()
    .slice(0, 8);
  await db.insert(recurringSchedule).values([
    {
      accountId: checking.id,
      amount: "19000",
      categoryId: categoryId("Housing"),
      frequency: "monthly",
      name: "Condo rent",
      nextOccurrenceDate: `${nextMonth}05`,
      organizationId: household.id,
      startDate: openingDate,
    },
    {
      accountId: checking.id,
      amount: "2500",
      categoryId: categoryId("Utilities"),
      frequency: "monthly",
      name: "Meralco electricity bill",
      nextOccurrenceDate: `${nextMonth}10`,
      organizationId: household.id,
      startDate: openingDate,
    },
  ]);
};
