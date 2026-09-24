# Monthly category budgets

`budgets.*` (`budgets.router.ts`) plan spending per expense category per household-local month. Only the planned amount is stored (`category_budget`); actual spending is read at query time from `getCategoryTotals` in `reports/reports.queries.ts`, the same split-aware category totals the spending report uses. There is no second aggregate.

## Procedures

| Procedure | Permission | Input | Output |
| --- | --- | --- | --- |
| `month` | `budget: read`, `transaction: read` | `{ month?: "YYYY-MM" }` | `{ month, currentMonth, today, timezone, dateFrom, dateTo, defaultCurrency, lines[], totals }` |
| `set` | `budget: update` | `{ categoryId, month, amount }` | the stored budget (upsert) |
| `clear` | `budget: delete` | `{ categoryId, month }` | the removed budget |

- `lines`: every expense category, plus archived ones that have a budget or spending that month. Each carries `budget | null`, `spent`, `remaining`, `overBy`, `percentUsed` (floored, uncapped) and `status` (`unbudgeted`, `within` or `overspent`). Spending exactly the budget is `within`.
- `totals`: household-currency lines only, netted across categories.

## Semantics

- **Months** are household-local calendar months. `month` omitted is the current month in `organization.timezone`. Like the reports, the current month counts up to today, so a future-dated entry does not count until its date. A future month has `dateTo: null` and no actuals.
- **What counts** is the same as the spending report: unarchived, categorized expense lines, including unpaid ones. Transfers and income never count.
- **Currency.** A budget stores the household currency at the time it was set, and only spending in that currency counts against it. There is no FX data, so other-currency spending is returned in `otherCurrencies` and is never added in.
- **Archived categories** keep their budgets and show them read-only. `set` and `clear` refuse until the category is restored. A category's type cannot change once a budget uses it.
- `month` is indexed with `(organization_id, month, category_id)`, and that index is also the uniqueness guard.
