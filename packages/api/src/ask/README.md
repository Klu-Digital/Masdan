# Ask Masdan

`ask.question` (`ask.router.ts`) answers one natural-language question about the **active household** from the same queries the Reports and Transactions screens run. It is an `orgProcedure` behind `requireFlag("FF__ASK_MASDAN")` and `transaction: read`, and it is read-only.

## How a question becomes an answer

1. **Plan** (`ask.plan.ts`, pure). The model gets the question, today's date and the household's account and category _names_, never an identifier. It returns `askExtraction`: one intent from a fixed set, a report period, and the words to filter on. The output is validated like any other untrusted input. Every name is matched against the household's own rows: categories by exact name, accounts through quick entry's `resolveAccountText`. An account or search word the question never says is dropped, and an unknown or ambiguous name is asked back (`clarify`) instead of guessed.
2. **Run** (`ask.queries.ts`). `organizationId` comes from the session only. The plan runs through `reports.queries.ts` and the ledger's `transactionListConditions`, so there is one definition of spending, cash flow and net worth.
3. **Word**. The headline is templated from the query results. The model never writes it, so it cannot invent a number.

| Intent | Numbers from | Link |
| --- | --- | --- |
| `spending`, `income` | `getCategoryTotals`, the Reports split-aware category totals. With a `search`, the Transactions screen's filtered totals | `/transactions` with the same filters |
| `cash_flow` | `getCashFlow` | `/transactions` with the same range |
| `largest_transactions` | `transactionListConditions`, by amount, at most 10 rows | `/transactions` with the same filters |
| `net_worth` | `getNetWorth` today. For a past day, `getNetWorthHistory` at that day | `/reports` |
| `account_balances` | `getAccountBalances`, which needs `financialAccount: read` | `/accounts` or the account |

Every answer carries `context`: the resolved period, as-of day and the filters actually applied, so the numbers can be checked against those screens.

## Failing safe

- `unavailable`: `ASK_MASDAN_AI_MODEL` or the gateway is unset, or the call failed, timed out or returned something off-schema. The question is never logged.
- `unsupported`: the model classed the question as outside the fixed set (advice, predictions, edits, anything else).
- `clarify`: dates that don't parse or run backwards, or a category or account the household doesn't have or has more than one of.

## Tests

`ask.golden.ts` is the eval set: questions paired with model responses and the plan they must produce. `ask.test.ts` scores it. `ask.db.test.ts` runs the real procedure with only the gateway mocked. It checks that answers match the Reports and Transactions procedures and that another household's names and IDs resolve to nothing.
