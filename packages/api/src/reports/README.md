# Household reports

`reports.*` (`reports.router.ts`) are `orgProcedure`s over the canonical ledger for the **active household only**. The query logic lives in plain `(db, organizationId, …)` functions in `reports.queries.ts`; `transactions.summary` and `transactions.totals` reuse them, so there is one cash-flow and one category implementation. There is no FX data: every amount is exact `numeric(30,6)` text from Postgres, **per currency**, never converted or mixed. The household default currency is the headline and comes first where order matters.

## Procedures

| Procedure | Permission | Input | Output |
| --- | --- | --- | --- |
| `period` | `transaction: read` | `{ preset, dateFrom?, dateTo? }` | `{ preset, dateFrom, dateTo, today, timezone, defaultCurrency }` |
| `netWorth` | `financialAccount: read` | none | `{ defaultCurrency, today, positions[], byType[] }` |
| `netWorthHistory` | `financialAccount: read`, `transaction: read` | period + `granularity?: "day" \| "week" \| "month"` | `{ period, defaultCurrency, granularity, dateFrom, dateTo, points: [{ date, positions[] }] }` |
| `cashFlow` | `transaction: read` | period + `accountIds?` | `{ period, defaultCurrency, months[], monthly[], totals[] }` |
| `spendingByCategory` | `transaction: read` | period + `accountIds?` | `{ period, defaultCurrency, categories[], totals[] }` |

- `positions` (net worth): `currencyCode, assets, liabilities, netWorth, liquidAssets, semiLiquidAssets, illiquidAssets, unclassifiedAssets, liquidNetWorth, accountCount`. History positions carry `assets, liabilities, liquidAssets, netWorth`.
- `byType`: `currencyCode, accountClass, accountType, total, accountCount`.
- `monthly`: `month (YYYY-MM), currencyCode, income, expense, net`. `months` lists every month in the range, including empty ones. `totals`: `currencyCode, income, expense, net`.
- `categories`: `categoryId, name, icon, color, type, currencyCode, total, count`, largest first.

## Periods

`preset` is `this_month`, `last_month`, `last_3_months`, `last_6_months`, `last_12_months`, `year_to_date`, `last_year`, `all_time` or `custom` (which needs `dateFrom <= dateTo`). The server resolves presets from `organization.timezone`, so "today" is the household's calendar day, not the server's or the browser's. Ranges that include the current month end **today**. `last_month` and `last_year` are whole calendar periods. `all_time` starts at the household's first opening balance date or unarchived transaction date. Every range includes both its first and last day.

## Semantics

- **Balance formula.** Net worth uses `balanceExpression` from `accounts/balances.ts`. History runs the same expression as of each point, through `balancePostings(asOf)`. There is no second formula. Liabilities are stored as positive amounts owed, and net worth is assets minus liabilities, so a credit-card purchase lowers it and a card payment (a transfer) leaves it unchanged.
- **Current net worth** covers active (`archivedAt IS NULL`) accounts with `includeInNetWorth`. It counts every posting on or after the opening balance date, **including future-dated ones**, which is exactly what the accounts screen shows. Liquid net worth is liquid assets minus all liabilities.
- **History** returns points at the end of each day, week (Monday start) or calendar month, clipped to the range. The last point is the range end or today, whichever is earlier. The series starts at the earliest opening balance date among included accounts. Each point is as of that date, so a future-dated entry appears only once its date passes. An account counts from its `openingBalanceDate`, and earlier dates never pretend it existed. Postings dated before `openingBalanceDate` are treated as already inside the opening balance, the same as today's balance. An archived account counts until the household-local day it was archived and drops out from that day on. `includeInNetWorth` is not historized. Omitting `granularity` gives days up to 62 days, weeks up to 190 days, and month-ends beyond that. More than 1000 points is a `BAD_REQUEST`.
- **Cash flow and spending** count every unarchived categorized transaction in the range. Transfers never count. These are events, so they include archived accounts, accounts excluded from net worth, and entries dated before an account's opening balance date. Splits count toward their own categories.
- **Unpaid** (`paidStatus`) entries count everywhere, the same as in `balances.ts`: paid status is a workflow flag, not a ledger exclusion.
- **Imported rows** are ordinary `financial_transaction` rows and flow through the same queries. `reports-import.db.test.ts` runs a real `processImport` to cover this.
- **Balance snapshots** (`financial_account_balance_snapshot`) do not feed reports yet, because balances do not use them either.

## Indexes

`EXPLAIN ANALYZE` on 12k synthetic postings found nothing new worth adding. Cash flow and categories use `financial_transaction_organization_date_idx`, which takes under 1 ms. History does one bounded posting scan per point, about 250 ms for 69 month-ends over 12k rows. If large imported histories make that slow, the next step is a cumulative window over the same per-posting expression. Adding an index would not fix it.
