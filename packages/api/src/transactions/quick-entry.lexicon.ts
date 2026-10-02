/**
 * The words quick entry's deterministic pass recognises, in English and
 * Tagalog. Entries are matched after `normalizeCardText`: lowercase,
 * accent-free, space-separated. Category inference is the model's job, so
 * there are no merchant or category keywords here.
 */

/** Say money came in; they only set the type. */
export const INCOME_WORDS: ReadonlySet<string> = new Set([
  "bonus",
  "cashback",
  "earned",
  "income",
  "natanggap",
  "payroll",
  "received",
  "refund",
  "sahod",
  "salary",
  "sweldo",
  "suweldo",
]);

// Longest first, so "not paid" wins over "paid".
export const UNPAID_PHRASES: readonly string[] = [
  "hindi pa bayad",
  "not yet paid",
  "di pa bayad",
  "babayaran",
  "not paid",
  "pending",
  "unpaid",
];

export const PAID_PHRASES: readonly string[] = ["bayad na", "settled", "paid"];

/** Introduce an account — "via GCash", "gamit BPI" — and leave with it. */
export const ACCOUNT_LEAD_WORDS: ReadonlySet<string> = new Set([
  "from",
  "gamit",
  "my",
  "on",
  "sa",
  "thru",
  "through",
  "using",
  "via",
  "with",
]);

/** Name words too generic to pick out an account on their own. */
export const GENERIC_ACCOUNT_WORDS: ReadonlySet<string> = new Set([
  "account",
  "acct",
  "and",
  "bank",
  "card",
  "checking",
  "credit",
  "current",
  "debit",
  "fund",
  "joint",
  "main",
  "my",
  "of",
  "personal",
  "savings",
  "the",
  "wallet",
]);

/** Refer to an account by type; they only resolve when one account has it. */
export const ACCOUNT_TYPE_WORDS: Readonly<Record<string, readonly string[]>> = {
  cash: ["cash"],
  credit_card: ["cc", "credit card"],
  e_wallet: ["ewallet", "e wallet"],
};

export const RELATIVE_DAYS: Readonly<Record<string, number>> = {
  "day before yesterday": -2,
  kagabi: -1,
  kahapon: -1,
  kamakalawa: -2,
  kanina: 0,
  "last night": -1,
  ngayon: 0,
  today: 0,
  yesterday: -1,
};

/** Index 0 is Sunday, matching `Date#getUTCDay`. */
export const WEEKDAYS: readonly (readonly string[])[] = [
  ["sunday"],
  ["monday", "lunes"],
  ["tuesday", "martes"],
  ["wednesday", "miyerkules"],
  ["thursday", "huwebes"],
  ["friday", "biyernes"],
  ["saturday", "sabado"],
];

/** Index 0 is January. A month only counts beside a day number. */
export const MONTHS: readonly (readonly string[])[] = [
  ["january", "jan", "enero"],
  ["february", "feb", "pebrero"],
  ["march", "mar", "marso"],
  ["april", "apr", "abril"],
  ["may", "mayo"],
  ["june", "jun", "hunyo"],
  ["july", "jul", "hulyo"],
  ["august", "aug", "agosto"],
  ["september", "sep", "sept", "setyembre"],
  ["october", "oct", "oktubre"],
  ["november", "nov", "nobyembre"],
  ["december", "dec", "disyembre"],
];

export const CURRENCY_WORDS: Readonly<Record<string, string>> = {
  $: "USD",
  dollar: "USD",
  dollars: "USD",
  p: "PHP",
  peso: "PHP",
  pesos: "PHP",
  php: "PHP",
  usd: "USD",
  "₱": "PHP",
};
