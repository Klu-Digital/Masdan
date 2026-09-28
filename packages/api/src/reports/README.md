# Household reports

`reports.*` (`reports.router.ts`) are `orgProcedure`s over the canonical ledger for the **active household only**. The query logic lives in plain `(db, organizationId, …)` functions in `reports.queries.ts`; `transactions.summary` and `transactions.totals` reuse them, so there is one cash-flow and one category implementation. The original reports return exact `numeric(30,6)` text from Postgres, **per currency**, never converted or mixed. The household default currency is the headline and comes first where order matters.

## Procedures

| Procedure | Permission | Input | Output |
| --- | --- | --- | --- |
| `period` | `transaction: read` | `{ preset, dateFrom?, dateTo? }` | `{ preset, dateFrom, dateTo, today, timezone, defaultCurrency }` |
| `netWorth` | `financialAccount: read` | none | `{ defaultCurrency, today, positions[], byType[] }` |
| `consolidatedNetWorth` | `financialAccount: read` | none | `{ defaultCurrency, today, status, assets, liabilities, netWorth, rates[], accounts[], unconverted[] }` |
| `netWorthHistory` | `financialAccount: read`, `transaction: read` | period + `granularity?: "day" \| "week" \| "month"` | `{ period, defaultCurrency, granularity, dateFrom, dateTo, points: [{ date, positions[] }] }` |
| `cashFlow` | `transaction: read` | period + `accountIds?` | `{ period, defaultCurrency, months[], monthly[], totals[] }` |
| `budgetPerformance` | `budget: read`, `transaction: read` | period | `{ period, defaultCurrency, months[], totals[], truncated }` |
| `spendingByCategory` | `transaction: read` | period + `accountIds?` | `{ period, defaultCurrency, categories[], totals[] }` |

- `positions` (net worth): `currencyCode, assets, liabilities, netWorth, liquidAssets, semiLiquidAssets, illiquidAssets, unclassifiedAssets, liquidNetWorth, accountCount`. History positions carry `assets, liabilities, liquidAssets, netWorth`.
- `byType`: `currencyCode, accountClass, accountType, total, accountCount`.
- `monthly`: `month (YYYY-MM), currencyCode, income, expense, net, savingsRate`. `months` lists every month in the range, including empty ones. `totals`: `currencyCode, income, expense, net, savingsRate`. Savings rate is `(income - expense) / income` as a percentage rounded to one decimal; it is `null` without positive income. Period rates use period totals, not monthly averages.
- `categories`: `categoryId, name, icon, color, type, currencyCode, total, count`, largest first.

## Consolidation and exchange rates

- **As-of:** `consolidatedNetWorth` uses the household's local today and the same included active accounts as `netWorth`.
- **Selection:** For each account currency, use the latest rate dated no later than today: a household manual direct or inverse rate to/from the default currency, or an ECB cross from same-day EUR feed legs (`EUR→default / EUR→account currency`; an EUR leg is 1). Manual wins date ties. Feed rates are shared reference data; manual rates belong to one household and must include its default currency.
- **Stale:** Rates more than seven calendar days old still convert but are flagged.
- **Missing:** Accounts without a rate stay in their original currency under `unconverted`, are excluded from consolidated totals and percentages, and make the report partial. Partial balance-sheet totals are labeled as such.
- **Rounding:** Convert balances at full precision, round half away from zero to the default currency's minor units **per account**, then sum; assets minus liabilities equals net worth.
- **Original reports:** Account balances, `netWorth` and history stay per currency and never mix currencies. FX-adjusted history is a follow-up.

## Periods

`preset` is `this_month`, `last_month`, `last_3_months`, `last_6_months`, `last_12_months`, `year_to_date`, `last_year`, `all_time` or `custom` (which needs `dateFrom <= dateTo`). The server resolves presets from `organization.timezone`, so "today" is the household's calendar day, not the server's or the browser's. Ranges that include the current month end **today**. `last_month` and `last_year` are whole calendar periods. `all_time` starts at the household's first opening balance date or unarchived transaction date. Every range includes both its first and last day.

## Semantics

- **Balance formula.** Net worth uses `balanceExpression` from `accounts/balances.ts`. History runs the same expression as of each point, through `balancePostings(asOf)`. There is no second formula. Liabilities are stored as positive amounts owed, and net worth is assets minus liabilities, so a credit-card purchase lowers it and a card payment (a transfer) leaves it unchanged.
- **Current net worth** covers active (`archivedAt IS NULL`) accounts with `includeInNetWorth`. It counts every posting on or after the opening balance date, **including future-dated ones**, which is exactly what the accounts screen shows. Liquid net worth is liquid assets minus all liabilities.
- **History** returns points at the end of each day, week (Monday start) or calendar month, clipped to the range. The last point is the range end or today, whichever is earlier. The series starts at the earliest opening balance date among included accounts. Each point is as of that date, so a future-dated entry appears only once its date passes. An account counts from its `openingBalanceDate`, and earlier dates never pretend it existed. Postings dated before `openingBalanceDate` are treated as already inside the opening balance, the same as today's balance. An archived account counts until the household-local day it was archived and drops out from that day on. `includeInNetWorth` is not historized. Omitting `granularity` gives days up to 62 days, weeks up to 190 days, and month-ends beyond that. More than 1000 points is a `BAD_REQUEST`.
- **Cash flow and spending** count every unarchived categorized transaction in the range. Transfers never count. These are events, so they include archived accounts, accounts excluded from net worth, and entries dated before an account's opening balance date. Splits count toward their own categories.
- **Budget performance** includes only months with budgets in the selected range up to the current month and only budgeted category lines. Each month counts as a whole household-local month (up to today for the current month), even when the selected date range starts or ends mid-month, exactly like the Budgets screen. Its lines carry `categoryId, name, icon, color, archived, currencyCode, budgeted, spent, variance, percentUsed, status`; variance is budgeted minus spent, negative when over budget. Month and report totals (`currencyCode, budgeted, spent, variance`) stay per budget currency, with the household default first; other-currency spending never counts against a budget. Only the latest 36 budgeted months are returned; `truncated` indicates older months were omitted.
- **Unpaid** (`paidStatus`) entries count everywhere, the same as in `balances.ts`: paid status is a workflow flag, not a ledger exclusion.
- **Imported rows** are ordinary `financial_transaction` rows and flow through the same queries. `reports-import.db.test.ts` runs a real `processImport` to cover this.
- **Balance snapshots** (`financial_account_balance_snapshot`) do not feed reports yet, because balances do not use them either.

## Indexes

`EXPLAIN ANALYZE` on 12k synthetic postings found nothing new worth adding. Cash flow and categories use `financial_transaction_organization_date_idx`, which takes under 1 ms. History does one bounded posting scan per point, about 250 ms for 69 month-ends over 12k rows. If large imported histories make that slow, the next step is a cumulative window over the same per-posting expression. Adding an index would not fix it.
