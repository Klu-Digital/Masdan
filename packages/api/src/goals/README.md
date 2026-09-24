# Savings goals

`goals.*` (`goals.router.ts`) track a target amount against **one asset account's ledger balance**. A goal stores its target, an optional target date and its lifecycle (`savings_goal`). Progress is never stored. It is the account's balance from `balanceExpression` in `accounts/balances.ts`, the formula the accounts screen and net worth use.

## Procedures

| Procedure | Permission | Notes |
| --- | --- | --- |
| `list`, `get` | `savingsGoal: read` | active first, then completed, then archived |
| `create`, `update` | `savingsGoal: create` / `update` | account must be this household's and an asset; `update` only while active |
| `complete`, `reopen` | `savingsGoal: update` | active → completed → active |
| `archive`, `restore` | `savingsGoal: archive` / `restore` | from active or completed; restore returns to the previous state |

Each goal returns `saved`, `remaining`, `percent`, `reached`, `status` and `measuredOn`.

## Semantics

- **Currency** is the tracking account's currency. Goals follow the ledger's per-currency rule and are never converted.
- **Active goals** read the current balance, including future-dated postings, the same way the accounts screen does.
- **Completed and archived goals** read the balance as of the household-local day they closed (`measuredOn`). Later spending from the account does not rewrite a finished goal.
- **Display arithmetic** is exact six-place decimals (`progress.ts`). `percent` is floored and held to 0–100, so 99.99% never reads as done and an overdrawn account never shows negative progress. `remaining` is zero once reached and never negative. `saved` is the real balance, even when it is negative or past the target.
- **Shared accounts.** Two goals on one account each count its whole balance. Splitting a balance between goals would mean allocations, which would be a second ledger.
- Accounts are archived, never deleted. A goal keeps tracking an archived account, but a new or re-pointed goal needs an active one.
