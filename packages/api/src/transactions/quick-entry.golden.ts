import type {
  QuickEntryExtraction,
  QuickEntryField,
  QuickEntryHousehold,
  QuickEntryKind,
} from "./quick-entry";

// Grow this whenever a real entry parses wrong.

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const GOLDEN_IDS = {
  bdoVisa: id(6),
  bpiSavings: id(1),
  cash: id(7),
  emergencyFund: id(11),
  entertainment: id(108),
  food: id(101),
  freelance: id(111),
  gcash: id(2),
  groceries: id(102),
  health: id(107),
  housing: id(106),
  hsbcDollar: id(10),
  maya: id(3),
  metrobankPayroll: id(5),
  metrobankTitanium: id(4),
  salary: id(110),
  shopping: id(104),
  transport: id(103),
  unionbankA: id(8),
  unionbankB: id(9),
  utilities: id(105),
} as const;

const account = (
  accountId: string,
  name: string,
  accountType: string,
  extra: Partial<QuickEntryHousehold["accounts"][number]> = {}
): QuickEntryHousehold["accounts"][number] => ({
  accountType,
  cardLastFour: null,
  cardNetwork: null,
  cardProductKey: null,
  currencyCode: "PHP",
  id: accountId,
  institution: null,
  name,
  ...extra,
});

export const GOLDEN_HOUSEHOLD: QuickEntryHousehold = {
  accounts: [
    account(GOLDEN_IDS.bpiSavings, "BPI Savings", "bank", {
      institution: "BPI",
    }),
    account(GOLDEN_IDS.gcash, "GCash", "e_wallet"),
    account(GOLDEN_IDS.maya, "Maya", "e_wallet"),
    account(GOLDEN_IDS.metrobankTitanium, "Metrobank Titanium", "credit_card", {
      cardLastFour: "4821",
      cardNetwork: "Mastercard",
      cardProductKey: "ph-metrobank-titanium-mastercard",
      institution: "Metrobank",
    }),
    account(GOLDEN_IDS.metrobankPayroll, "Metrobank Payroll", "bank", {
      institution: "Metrobank",
    }),
    account(GOLDEN_IDS.bdoVisa, "BDO Visa", "credit_card", {
      cardNetwork: "Visa",
      institution: "BDO",
    }),
    account(GOLDEN_IDS.cash, "Cash", "cash"),
    account(GOLDEN_IDS.unionbankA, "UnionBank Savings", "bank", {
      institution: "UnionBank",
    }),
    account(GOLDEN_IDS.unionbankB, "UnionBank Savings", "bank", {
      institution: "UnionBank",
    }),
    account(GOLDEN_IDS.hsbcDollar, "HSBC Dollar", "bank", {
      currencyCode: "USD",
      institution: "HSBC",
    }),
    account(GOLDEN_IDS.emergencyFund, "Emergency Fund", "bank"),
  ],
  categories: [
    { id: GOLDEN_IDS.food, name: "Food & Dining", type: "expense" },
    { id: GOLDEN_IDS.groceries, name: "Groceries", type: "expense" },
    { id: GOLDEN_IDS.transport, name: "Transport", type: "expense" },
    { id: GOLDEN_IDS.shopping, name: "Shopping", type: "expense" },
    { id: GOLDEN_IDS.utilities, name: "Utilities", type: "expense" },
    { id: GOLDEN_IDS.housing, name: "Housing", type: "expense" },
    { id: GOLDEN_IDS.health, name: "Health", type: "expense" },
    { id: GOLDEN_IDS.entertainment, name: "Entertainment", type: "expense" },
    { id: GOLDEN_IDS.salary, name: "Salary", type: "income" },
    { id: GOLDEN_IDS.freelance, name: "Freelance", type: "income" },
  ],
  // A Saturday.
  today: "2026-09-26",
};

const NOTHING: QuickEntryExtraction = {
  account: null,
  amount: null,
  category: null,
  currency: null,
  date: null,
  dateText: null,
  kind: null,
  notes: null,
  paidStatus: null,
};

export const ai = (
  extraction: Partial<QuickEntryExtraction>
): QuickEntryExtraction => ({ ...NOTHING, ...extraction });

export interface GoldenCase {
  name: string;
  text: string;
  /** The mocked model response; `null` is an unavailable or failed model. */
  extraction: QuickEntryExtraction | null;
  expected:
    | {
        outcome: "create";
        kind: QuickEntryKind;
        accountId: string;
        amount: string;
        categoryId: string;
        notes: string | null;
        paidStatus?: "paid" | "unpaid";
        transactionDate?: string;
      }
    | {
        outcome: "review";
        fields: QuickEntryField[];
        /** Values the form must still arrive prefilled with. */
        prefill?: Partial<{
          accountId: string | null;
          amount: string | null;
          categoryId: string | null;
          transactionDate: string;
        }>;
      };
}

export const GOLDEN_CASES: readonly GoldenCase[] = [
  // --- Complete: created without the form ---------------------------------
  {
    expected: {
      accountId: GOLDEN_IDS.gcash,
      amount: "2999",
      categoryId: GOLDEN_IDS.shopping,
      kind: "expense",
      notes: "iPad Reimbursement",
      outcome: "create",
    },
    extraction: ai({
      account: "gcash",
      amount: "2999",
      category: "Shopping",
      notes: "iPad Reimbursement",
    }),
    name: "an ambiguous word stays an expense, with the note tidied",
    text: "ipad reimbursement 2999 gcash",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.gcash,
      amount: "2999",
      categoryId: GOLDEN_IDS.shopping,
      kind: "expense",
      notes: "ipad reimbursement",
      outcome: "create",
    },
    extraction: ai({
      account: "gcash",
      amount: "2999",
      category: "Shopping",
      notes: "Apple iPad Reimbursement Payment",
    }),
    name: "a reworded note with added words falls back to the typed words",
    text: "ipad reimbursement 2999 gcash",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.metrobankTitanium,
      amount: "400",
      categoryId: GOLDEN_IDS.food,
      kind: "expense",
      notes: "mj date - dinner at jollibee",
      outcome: "create",
      transactionDate: "2026-09-26",
    },
    extraction: ai({
      account: "metrobank mc",
      amount: "400",
      category: "Food & Dining",
      kind: "expense",
    }),
    name: "the ticket's example: card alias, separators, inferred category",
    text: "mj date - dinner at jollibee - 400 - metrobank mc",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.bpiSavings,
      amount: "50000",
      categoryId: GOLDEN_IDS.salary,
      kind: "income",
      notes: "sahod",
      outcome: "create",
      transactionDate: "2026-09-25",
    },
    extraction: ai({
      account: "bpi savings",
      amount: "50,000",
      category: "Salary",
      date: "2026-09-25",
      dateText: "kahapon",
      kind: "income",
    }),
    name: "Taglish income with a relative date",
    text: "sahod 50,000 bpi savings kahapon",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.gcash,
      amount: "250",
      categoryId: GOLDEN_IDS.transport,
      kind: "expense",
      notes: "grab to makati",
      outcome: "create",
    },
    extraction: ai({
      account: "gcash",
      amount: "₱250",
      category: "Transport",
      currency: "PHP",
      kind: "expense",
    }),
    name: "peso sign and an e-wallet introduced by 'via'",
    text: "grab to makati ₱250 via gcash",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.maya,
      amount: "1500",
      categoryId: GOLDEN_IDS.groceries,
      kind: "expense",
      notes: "groceries",
      outcome: "create",
      transactionDate: "2026-09-25",
    },
    extraction: ai({
      account: "maya",
      amount: "1.5k",
      category: "Groceries",
      date: "2026-09-25",
      dateText: "yesterday",
    }),
    name: "a named category and a 'k' amount",
    text: "groceries 1.5k maya yesterday",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.bdoVisa,
      amount: "3245.5",
      categoryId: GOLDEN_IDS.utilities,
      kind: "expense",
      notes: "meralco bill",
      outcome: "create",
      paidStatus: "unpaid",
    },
    extraction: ai({
      account: "bdo visa",
      amount: "3,245.50",
      category: "Utilities",
      kind: "expense",
      paidStatus: "unpaid",
    }),
    name: "an unpaid bill on a credit card",
    text: "meralco bill 3,245.50 bdo visa unpaid",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.cash,
      amount: "180",
      categoryId: GOLDEN_IDS.food,
      kind: "expense",
      notes: "lunch",
      outcome: "create",
    },
    extraction: ai({
      account: "cash",
      amount: "180",
      category: "Food & Dining",
    }),
    name: "cash",
    text: "lunch 180 cash",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.metrobankTitanium,
      amount: "150",
      categoryId: GOLDEN_IDS.food,
      kind: "expense",
      notes: "coffee",
      outcome: "create",
    },
    extraction: ai({
      account: "*4821",
      amount: "150",
      category: "Food & Dining",
    }),
    name: "a card by its last four digits",
    text: "coffee 150 *4821",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.gcash,
      amount: "100",
      categoryId: GOLDEN_IDS.utilities,
      kind: "expense",
      notes: "load",
      outcome: "create",
      transactionDate: "2026-09-21",
    },
    extraction: ai({
      account: "gcash",
      amount: "100",
      category: "Utilities",
      date: "2026-09-21",
      dateText: "last monday",
    }),
    name: "a weekday",
    text: "load 100 gcash last monday",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.bpiSavings,
      amount: "800",
      categoryId: GOLDEN_IDS.food,
      kind: "expense",
      notes: "dinner",
      outcome: "create",
      transactionDate: "2026-09-20",
    },
    extraction: ai({
      account: "bpi savings",
      amount: "800",
      category: "Food & Dining",
      date: "2026-09-20",
      dateText: "sep 20",
    }),
    name: "a month and day",
    text: "sep 20 dinner 800 bpi savings",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.hsbcDollar,
      amount: "50",
      categoryId: GOLDEN_IDS.shopping,
      kind: "expense",
      notes: "amazon",
      outcome: "create",
    },
    extraction: ai({
      account: "hsbc dollar",
      amount: "50",
      category: "Shopping",
    }),
    name: "omitted currency follows the account's",
    text: "hsbc dollar 50 amazon",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.maya,
      amount: "350",
      categoryId: GOLDEN_IDS.health,
      kind: "expense",
      notes: "bumili ng gamot",
      outcome: "create",
    },
    extraction: ai({
      account: "maya",
      amount: "350",
      category: "Health",
      kind: "expense",
    }),
    name: "Taglish with 'gamit' before the account",
    text: "bumili ng gamot 350 gamit maya",
  },
  {
    expected: {
      accountId: GOLDEN_IDS.gcash,
      amount: "400",
      categoryId: GOLDEN_IDS.food,
      kind: "expense",
      notes: "dinner",
      outcome: "create",
    },
    extraction: ai({
      account: "bpi savings",
      amount: "400",
      category: "Food & Dining",
    }),
    name: "a model naming an account the text never mentions is ignored",
    text: "dinner 400 gcash",
  },

  // --- Review: the form opens -----------------------------------------------
  {
    expected: {
      fields: ["amount"],
      outcome: "review",
      prefill: {
        accountId: GOLDEN_IDS.metrobankTitanium,
        categoryId: GOLDEN_IDS.food,
      },
    },
    extraction: ai({
      account: "metrobank mc",
      category: "Food & Dining",
    }),
    name: "missing amount",
    text: "dinner at jollibee metrobank mc",
  },
  {
    expected: {
      fields: ["accountId"],
      outcome: "review",
      prefill: { amount: "400", categoryId: GOLDEN_IDS.food },
    },
    extraction: ai({ amount: "400", category: "Food & Dining" }),
    name: "missing account",
    text: "dinner 400",
  },
  {
    expected: {
      fields: ["accountId"],
      outcome: "review",
      prefill: { accountId: null, amount: "500" },
    },
    extraction: ai({
      account: "unionbank savings",
      amount: "500",
      category: "Groceries",
    }),
    name: "two accounts with the same name",
    text: "groceries 500 unionbank savings",
  },
  {
    expected: { fields: ["accountId"], outcome: "review" },
    extraction: ai({
      account: "metrobank",
      amount: "500",
      category: "Groceries",
    }),
    name: "a bank that holds both a card and a deposit account",
    text: "metrobank 500 groceries",
  },
  {
    expected: { fields: ["accountId"], outcome: "review" },
    extraction: ai({
      account: "gcash",
      amount: "500",
      category: "Groceries",
    }),
    name: "two different accounts mentioned",
    text: "gcash 500 bpi savings groceries",
  },
  {
    expected: {
      fields: ["amount"],
      outcome: "review",
      prefill: { accountId: GOLDEN_IDS.gcash, amount: null },
    },
    extraction: ai({
      account: "gcash",
      amount: "300",
      category: "Food & Dining",
    }),
    name: "more than one amount",
    text: "2 coffees 300 gcash",
  },
  {
    expected: { fields: ["transactionDate"], outcome: "review" },
    extraction: ai({
      account: "gcash",
      amount: "500",
      category: "Food & Dining",
      date: "2026-09-25",
      dateText: "yesterday",
    }),
    name: "conflicting dates",
    text: "dinner 500 gcash yesterday sep 20",
  },
  {
    expected: { fields: ["transactionDate"], outcome: "review" },
    extraction: ai({
      account: "gcash",
      amount: "500",
      category: "Food & Dining",
    }),
    name: "a date that does not exist",
    text: "dinner 500 gcash feb 30",
  },
  {
    expected: {
      fields: ["transactionDate"],
      outcome: "review",
      prefill: { transactionDate: "2026-09-25" },
    },
    extraction: ai({
      account: "gcash",
      amount: "500",
      category: "Food & Dining",
      date: "2026-09-24",
      dateText: "kahapon",
    }),
    name: "the model disagreeing with a relative date",
    text: "dinner 500 gcash kahapon",
  },
  {
    expected: { fields: ["accountId"], outcome: "review" },
    extraction: ai({
      account: "security bank",
      amount: "500",
      category: "Food & Dining",
    }),
    name: "an account the household does not have",
    text: "dinner 500 security bank",
  },
  {
    expected: {
      fields: ["categoryId"],
      outcome: "review",
      prefill: { accountId: GOLDEN_IDS.gcash, amount: "500" },
    },
    extraction: ai({ account: "gcash", amount: "500", category: "Charity" }),
    name: "a category the household does not have",
    text: "donation 500 gcash",
  },
  {
    expected: { fields: ["categoryId"], outcome: "review" },
    extraction: ai({
      account: "gcash",
      amount: "500",
      category: GOLDEN_IDS.food,
    }),
    name: "a model answering with an identifier instead of a name",
    text: "dinner 500 gcash",
  },
  {
    expected: {
      fields: ["amount", "accountId", "categoryId"],
      outcome: "review",
    },
    extraction: ai({}),
    name: "malformed input",
    text: "asdfgh ;; --",
  },
  {
    expected: {
      fields: [],
      outcome: "review",
      prefill: {
        accountId: GOLDEN_IDS.gcash,
        amount: "1500",
        categoryId: GOLDEN_IDS.groceries,
      },
    },
    extraction: null,
    name: "a complete entry never skips the form when the model is unavailable",
    text: "groceries 1500 gcash",
  },
  {
    expected: { fields: ["amount"], outcome: "review" },
    extraction: ai({
      account: "gcash",
      amount: "4000",
      category: "Food & Dining",
    }),
    name: "the model disagreeing with the amount",
    text: "dinner 400 gcash",
  },
  {
    expected: {
      fields: ["accountId"],
      outcome: "review",
      prefill: { accountId: GOLDEN_IDS.emergencyFund },
    },
    extraction: ai({ amount: "2000", category: "Groceries" }),
    name: "a single name word the model does not confirm",
    text: "emergency 2000 groceries",
  },
  {
    expected: {
      fields: ["kind"],
      outcome: "review",
      prefill: { categoryId: GOLDEN_IDS.groceries },
    },
    extraction: ai({ account: "gcash", amount: "500", kind: "income" }),
    name: "income words against an expense category",
    text: "refund 500 gcash groceries",
  },
  {
    expected: { fields: ["amount"], outcome: "review" },
    extraction: ai({ account: "gcash", category: "Food & Dining" }),
    name: "a zero amount",
    text: "dinner 0 gcash",
  },
  {
    expected: { fields: ["paidStatus"], outcome: "review" },
    extraction: ai({
      account: "bdo visa",
      amount: "3000",
      category: "Utilities",
    }),
    name: "paid and unpaid together",
    text: "meralco 3000 bdo visa paid, unpaid",
  },
  {
    expected: { fields: ["amount"], outcome: "review" },
    extraction: ai({
      account: "bpi savings",
      amount: "50",
      category: "Entertainment",
      currency: "USD",
    }),
    name: "a currency the account is not in",
    text: "netflix $50 bpi savings",
  },
];
