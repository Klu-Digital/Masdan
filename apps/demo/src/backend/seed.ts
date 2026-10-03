import {
  addDays,
  firstOccurrenceOnOrAfter,
} from "@masdan/api/recurring/recurrence";
import { monthStart } from "@masdan/api/reports/periods";
import { DEFAULT_CATEGORIES } from "@masdan/db/reference/categories";

import { institutionId, institutionName } from "./catalog";
import type {
  Account,
  Category,
  DemoState,
  Schedule,
  Statement,
  Tag,
  Transaction,
} from "./store";
import { money, seedId, sum, text, todayIn } from "./util";

const TIMEZONE = "Asia/Manila";
const CURRENCY = "PHP";
const MONTHS_OF_HISTORY = 12;
const PAYMENT_DAY = 20;
const STATEMENT_CLOSE_DAY = 27;

// Park–Miller: small enough to stay exact in a double, so every visit sees the same household.
const generator = (start: number) => {
  let value = start;
  return (): number => {
    value = (value * 16_807) % 2_147_483_647;
    return value / 2_147_483_647;
  };
};

const EXTRA_CATEGORIES = [
  { color: "indigo", icon: "📚", name: "Education", sortOrder: 130 },
  { color: "rose", icon: "🎁", name: "Gifts & Donations", sortOrder: 140 },
  { color: "amber", icon: "🐾", name: "Pets", sortOrder: 150 },
  { color: "teal", icon: "🏋️", name: "Fitness", sortOrder: 160 },
] as const;

const TAGS = [
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

type TagName = (typeof TAGS)[number]["name"];

interface Spending {
  budget: number;
  category: string;
  max: number;
  min: number;
  notes: readonly string[];
  tags: readonly TagName[];
  visits: number;
}

// The dev seeder's household, less what the recurring schedules post.
const SPENDING: readonly Spending[] = [
  {
    budget: 15_000,
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
    budget: 8000,
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
    budget: 5000,
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
    budget: 7000,
    category: "Utilities",
    max: 2600,
    min: 900,
    notes: [
      "PLDT Fiber — home internet",
      "Globe — mobile plan",
      "Manila Water — water bill",
    ],
    tags: ["Essentials", "Home"],
    visits: 2,
  },
  {
    budget: 4000,
    category: "Entertainment",
    max: 1200,
    min: 200,
    notes: [
      "Spotify Premium — monthly renewal",
      "Cinema tickets and popcorn",
      "Steam — game on sale",
      "Concert tickets with friends",
    ],
    tags: ["Leisure", "Subscriptions"],
    visits: 2,
  },
  {
    budget: 6000,
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
    budget: 4000,
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
    budget: 10_000,
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
    budget: 3000,
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
    budget: 4000,
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
    budget: 2500,
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
];

const HOUSING_BUDGET = 22_000;

const CARDS = [
  {
    institution: "Metrobank",
    key: "ph-metrobank-world-mastercard",
    limit: 200_000,
    name: "Metrobank World Mastercard",
    network: "Mastercard",
  },
  {
    institution: "HSBC",
    key: "ph-hsbc-live-plus-visa-signature",
    limit: 300_000,
    name: "HSBC Live+ Credit Card",
    network: "Visa",
  },
  {
    institution: "Zed",
    key: "ph-zed-titanium-mastercard",
    limit: 150_000,
    name: "Zed Card",
    network: "Mastercard",
  },
  {
    institution: "RCBC",
    key: "ph-rcbc-black-card-platinum-mastercard",
    limit: 400_000,
    name: "RCBC Black Card Platinum Mastercard",
    network: "Mastercard",
  },
] as const;

const institution = (key: string) => ({
  institution: institutionName(key),
  institutionId: institutionId(key),
});

const dayOf = (month: string, day: number): string =>
  `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;

// oxlint-disable-next-line max-statements, complexity
export const seed = (): DemoState => {
  const random = generator(20_261_003);
  const between = (min: number, max: number): number =>
    Math.floor(random() * (max - min + 1)) + min;
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) {
      throw new Error("Cannot pick from an empty list");
    }
    return item;
  };
  let sequence = 0;
  const id = (): string => {
    sequence += 1;
    return seedId(sequence);
  };
  const createdOn = (date: string): Date => {
    sequence += 1;
    return new Date(Date.parse(`${date}T01:00:00Z`) + sequence * 1000);
  };

  const today = todayIn(TIMEZONE);
  const openingDate = monthStart(today, -(MONTHS_OF_HISTORY - 1));
  const created = createdOn(openingDate);
  const organizationId = id();
  const user = {
    email: "demo@masdan.app",
    id: id(),
    image: null,
    name: "Sam Reyes",
  };
  const household = {
    createdAt: created,
    defaultCurrency: CURRENCY,
    id: organizationId,
    memberId: id(),
    name: "Reyes household",
    slug: "reyes-household",
    timezone: TIMEZONE,
  };

  const categories: Category[] = [
    ...DEFAULT_CATEGORIES,
    ...EXTRA_CATEGORIES.map((row) => ({ ...row, type: "expense" as const })),
  ].map((row) => ({
    archivedAt: null,
    color: row.color,
    createdAt: created,
    icon: row.icon,
    id: id(),
    name: row.name,
    organizationId,
    sortOrder: row.sortOrder,
    type: row.type,
    updatedAt: created,
  }));
  const categoryId = (name: string): string => {
    const found = categories.find((row) => row.name === name);
    if (!found) {
      throw new Error(`Missing demo category ${name}`);
    }
    return found.id;
  };

  const tags: Tag[] = TAGS.map((row) => ({
    ...row,
    archivedAt: null,
    createdAt: created,
    id: id(),
    organizationId,
    updatedAt: created,
  }));
  const tagIds = (names: readonly TagName[]): string[] =>
    names.flatMap((name) => tags.find((row) => row.name === name)?.id ?? []);

  const account = (
    fields: Pick<Account, "accountType" | "name"> & Partial<Account>
  ): Account => ({
    accountClass: "asset",
    archivedAt: null,
    cardLastFour: null,
    cardNetwork: null,
    cardProductKey: null,
    color: null,
    createdAt: created,
    creditLimit: null,
    currencyCode: CURRENCY,
    icon: null,
    id: id(),
    includeInNetWorth: true,
    institution: null,
    institutionId: null,
    liquidity: null,
    notes: null,
    openingBalance: money(0),
    openingBalanceDate: openingDate,
    organizationId,
    ownerMemberIds: [household.memberId],
    paymentDueDay: null,
    statementClosingDay: null,
    updatedAt: created,
    ...fields,
  });

  const checking = account({
    ...institution("ph-bdo"),
    accountType: "bank",
    liquidity: "liquid",
    name: "BDO payroll and everyday banking",
    openingBalance: money(300_000),
  });
  const wallet = account({
    ...institution("ph-gcash"),
    accountType: "e_wallet",
    liquidity: "liquid",
    name: "GCash everyday wallet",
    openingBalance: money(10_000),
  });
  const savings = account({
    ...institution("ph-bpi"),
    accountType: "bank",
    liquidity: "liquid",
    name: "BPI savings and emergency fund",
    openingBalance: money(1_450_000),
  });
  const travelFund = account({
    ...institution("ph-maya"),
    accountType: "bank",
    liquidity: "semi_liquid",
    name: "Maya travel fund",
    openingBalance: money(20_000),
  });
  const car = account({
    accountType: "vehicle",
    liquidity: "illiquid",
    name: "Toyota Vios 2022",
    notes: "Resale estimate from the last appraisal.",
    openingBalance: money(650_000),
  });
  const cards = CARDS.map((card, index) =>
    account({
      accountClass: "liability",
      accountType: "credit_card",
      cardLastFour: String(4101 + index),
      cardNetwork: card.network,
      cardProductKey: card.key,
      creditLimit: money(card.limit),
      institution: card.institution,
      name: card.name,
      paymentDueDay: PAYMENT_DAY,
      statementClosingDay: STATEMENT_CLOSE_DAY + 1,
    })
  );
  const [metrobank, hsbc, zed] = cards;
  if (!(metrobank && hsbc && zed)) {
    throw new Error("Missing demo cards");
  }

  const transactions: Transaction[] = [];
  const transfers: DemoState["transfers"] = [];
  const posting = (
    fields: Pick<Transaction, "accountId" | "amount" | "transactionDate"> &
      Partial<Transaction>
  ): Transaction => {
    const at = createdOn(fields.transactionDate);
    const row: Transaction = {
      adjustmentDirection: null,
      archivedAt: null,
      categoryId: null,
      createdAt: at,
      createdByUserId: user.id,
      currencyCode: CURRENCY,
      id: id(),
      notes: null,
      organizationId,
      paidStatus: "paid",
      reconciliationSnapshotId: null,
      recurringOccurrenceDate: null,
      recurringScheduleId: null,
      ruleApplication: null,
      splits: [],
      suggestionApplication: null,
      tagIds: [],
      transferId: null,
      transferSide: null,
      updatedAt: at,
      ...fields,
    };
    transactions.push(row);
    return row;
  };
  const transfer = (
    from: Account,
    to: Account,
    amount: string,
    date: string,
    notes: string
  ): void => {
    const at = createdOn(date);
    const row = {
      createdAt: at,
      destinationAccountId: to.id,
      destinationAmount: amount,
      id: id(),
      notes,
      organizationId,
      sourceAccountId: from.id,
      sourceAmount: amount,
      transactionDate: date,
      updatedAt: at,
    };
    transfers.push(row);
    for (const [side, target] of [
      ["source", from],
      ["destination", to],
    ] as const) {
      posting({
        accountId: target.id,
        amount,
        notes,
        transactionDate: date,
        transferId: row.id,
        transferSide: side,
      });
    }
  };

  const schedule = (
    fields: Pick<
      Schedule,
      "accountId" | "amount" | "categoryId" | "name" | "startDate"
    > &
      Partial<Schedule>
  ): Schedule => ({
    createdAt: created,
    endDate: null,
    frequency: "monthly",
    id: id(),
    interval: 1,
    lastError: null,
    nextOccurrenceDate: null,
    notes: null,
    paidStatus: "paid",
    pausedAt: null,
    status: "active",
    stoppedAt: null,
    tagIds: [],
    updatedAt: created,
    ...fields,
  });
  const pausedOn = monthStart(today, -2);
  const schedules = [
    schedule({
      accountId: checking.id,
      amount: money(95_000),
      categoryId: categoryId("Salary"),
      name: "Salary",
      notes: "Payroll — monthly salary",
      startDate: openingDate,
      tagIds: tagIds(["Income"]),
    }),
    schedule({
      accountId: checking.id,
      amount: money(19_000),
      categoryId: categoryId("Housing"),
      name: "Condo rent",
      notes: "Condo rent — monthly lease",
      startDate: dayOf(openingDate, 5),
      tagIds: tagIds(["Essentials", "Home"]),
    }),
    schedule({
      accountId: checking.id,
      amount: money(2500),
      categoryId: categoryId("Utilities"),
      name: "Meralco electricity bill",
      notes: "Meralco — electricity bill",
      startDate: dayOf(openingDate, 10),
      tagIds: tagIds(["Essentials", "Home"]),
    }),
    schedule({
      accountId: hsbc.id,
      amount: money(549),
      categoryId: categoryId("Entertainment"),
      name: "Netflix",
      notes: "Netflix — family subscription",
      startDate: dayOf(openingDate, 12),
      tagIds: tagIds(["Leisure", "Subscriptions"]),
    }),
    schedule({
      accountId: zed.id,
      amount: money(2500),
      categoryId: categoryId("Fitness"),
      endDate: null,
      name: "Gym membership",
      notes: "Gym membership renewal",
      pausedAt: new Date(`${pausedOn}T02:00:00Z`),
      startDate: dayOf(openingDate, 8),
      status: "paused",
      tagIds: tagIds(["Personal"]),
    }),
  ];

  // What the workers would have posted by today.
  for (const row of schedules) {
    const last = row.status === "paused" ? pausedOn : today;
    let date = firstOccurrenceOnOrAfter(row, row.startDate);
    while (date <= last) {
      posting({
        accountId: row.accountId,
        amount: row.amount,
        categoryId: row.categoryId,
        notes: row.notes,
        recurringOccurrenceDate: date,
        recurringScheduleId: row.id,
        tagIds: row.tagIds,
        transactionDate: date,
      });
      date = firstOccurrenceOnOrAfter(row, addDays(date, 1));
    }
    row.nextOccurrenceDate = date;
  }

  const budgets: DemoState["budgets"] = [];
  for (let offset = -(MONTHS_OF_HISTORY - 1); offset <= 0; offset += 1) {
    const month = monthStart(today, offset);
    const monthIndex = offset + MONTHS_OF_HISTORY - 1;
    const onDay = (day: number): string | null => {
      const date = dayOf(month, day);
      return date <= today ? date : null;
    };

    const freelanceDay = onDay(15);
    if (freelanceDay) {
      posting({
        accountId: checking.id,
        amount: money(between(5000, 20_000)),
        categoryId: categoryId("Freelance"),
        notes: pick([
          "Website project — milestone payment",
          "Consulting invoice — retainer",
          "Design commission — final payment",
        ]),
        tagIds: tagIds(["Income"]),
        transactionDate: freelanceDay,
      });
    }
    const interestDay = onDay(STATEMENT_CLOSE_DAY);
    if (interestDay) {
      posting({
        accountId: savings.id,
        amount: money(between(800, 2200)),
        categoryId: categoryId("Interest Income"),
        notes: "BPI savings — interest credit, net of tax",
        tagIds: tagIds(["Income"]),
        transactionDate: interestDay,
      });
    }

    for (const [index, spending] of SPENDING.entries()) {
      for (let visit = 0; visit < spending.visits; visit += 1) {
        // Spread across days 1–27, so even the first days of a month have spending.
        const date = onDay(
          1 + ((index * 3 + visit * Math.floor(27 / spending.visits)) % 27)
        );
        const amount = money(between(spending.min, spending.max));
        const notes = pick(spending.notes);
        if (!date) {
          continue;
        }
        let accountId =
          cards[(index + visit + monthIndex) % cards.length]?.id ?? hsbc.id;
        if (spending.category === "Transport") {
          accountId = wallet.id;
        } else if (spending.category === "Utilities") {
          accountId = checking.id;
        }
        posting({
          accountId,
          amount,
          categoryId: categoryId(spending.category),
          notes,
          tagIds: tagIds(spending.tags),
          transactionDate: date,
        });
      }
    }

    for (const spending of [
      ...SPENDING,
      { budget: HOUSING_BUDGET, category: "Housing" },
    ]) {
      budgets.push({
        amount: money(spending.budget),
        categoryId: categoryId(spending.category),
        currencyCode: CURRENCY,
        id: id(),
        month,
        updatedAt: created,
      });
    }

    const cashIn = onDay(2);
    if (cashIn) {
      transfer(
        checking,
        wallet,
        money(6000),
        cashIn,
        "GCash cash-in — monthly commute and errands"
      );
    }
    const saving = onDay(3);
    if (saving) {
      transfer(
        checking,
        travelFund,
        money(8000),
        saving,
        "Maya — monthly travel fund top-up"
      );
    }
  }

  // A cycle's charges close on the 27th and are paid in full on the next 20th.
  const statements: Statement[] = [];
  for (let offset = -(MONTHS_OF_HISTORY - 1); offset < 0; offset += 1) {
    const periodStart = monthStart(today, offset);
    const periodEnd = dayOf(periodStart, STATEMENT_CLOSE_DAY);
    const dueDate = dayOf(monthStart(today, offset + 1), PAYMENT_DAY);
    for (const card of cards) {
      const charged = sum(
        transactions
          .filter(
            (row) =>
              row.accountId === card.id &&
              row.transferId === null &&
              row.transactionDate >= periodStart &&
              row.transactionDate <= periodEnd
          )
          .map((row) => row.amount)
      );
      const balance = text(charged);
      const at = createdOn(dayOf(periodStart, STATEMENT_CLOSE_DAY + 1));
      statements.push({
        accountId: card.id,
        createdAt: at,
        dueDate,
        id: id(),
        minimumAmountDue: text(charged < 500_000_000n ? charged : 500_000_000n),
        organizationId,
        periodEnd,
        periodStart,
        statementBalance: balance,
        statementDate: dayOf(periodStart, STATEMENT_CLOSE_DAY + 1),
        updatedAt: at,
      });
      if (charged > 0n && dueDate <= today) {
        transfer(
          checking,
          card,
          balance,
          dueDate,
          `${card.name} — full payment of previous statement`
        );
      }
    }
  }

  const goalCreated = createdOn(openingDate);
  return {
    accounts: [checking, wallet, savings, travelFund, car, ...cards],
    billPayments: [],
    budgets,
    categories,
    dismissedReminders: new Set(),
    exchangeRates: [],
    goals: [
      {
        accountId: savings.id,
        archivedAt: null,
        completedAt: null,
        createdAt: goalCreated,
        id: id(),
        name: "Emergency fund",
        targetAmount: money(2_000_000),
        targetDate: monthStart(today, 12),
        updatedAt: goalCreated,
      },
      {
        accountId: travelFund.id,
        archivedAt: null,
        completedAt: null,
        createdAt: goalCreated,
        id: id(),
        name: "Japan trip",
        targetAmount: money(150_000),
        targetDate: monthStart(today, 6),
        updatedAt: goalCreated,
      },
    ],
    household,
    reminderIds: new Map(),
    rules: [
      {
        actions: {
          categoryId: categoryId("Groceries"),
          tagIds: tagIds(["Essentials"]),
        },
        conditions: {
          accountId: null,
          amountMax: null,
          amountMin: null,
          text: { operator: "contains", value: "Supermarket" },
          type: "expense",
        },
        createdAt: created,
        enabled: true,
        id: id(),
        name: "Supermarket groceries",
        position: 0,
        updatedAt: created,
      },
      {
        actions: { categoryId: categoryId("Transport"), tagIds: [] },
        conditions: {
          accountId: null,
          amountMax: null,
          amountMin: null,
          text: { operator: "startsWith", value: "GrabCar" },
          type: "expense",
        },
        createdAt: created,
        enabled: true,
        id: id(),
        name: "GrabCar rides",
        position: 1,
        updatedAt: created,
      },
    ],
    schedules,
    snapshots: [],
    statements,
    tags,
    transactions,
    transfers,
    user,
  };
};
