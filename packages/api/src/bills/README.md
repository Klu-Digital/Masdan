# Bill calendar

A month view of what the household owes: expense schedules from `recurring` and credit-card due dates from `reminders`' card data. It is computed live on every read. There is no bill table to keep in step, and no worker or cron of its own. The web screen is `/bills`, and calendar apps subscribe through `GET /feeds/bills/<token>.ics`.

## Procedures

| Procedure | Permission | Input | Output |
| --- | --- | --- | --- |
| `month` | `bill: read` | `{ month? }` (`YYYY-MM`, default: the household's current month) | `{ bills[], totals[], today, currentMonth, … }` |
| `candidates` | `bill: read`, `transaction: read` | `{ kind, sourceId, dueDate }` | Transactions that could be the bill's payment. The schedule's own posting comes first. |
| `confirm` | `bill: confirm`, `transaction: read` | `{ kind, sourceId, dueDate, transactionId \| null }` | `{ id }`. `null` confirms the bill with no payment attached. |
| `unconfirm` | `bill: confirm` | `{ paymentId }` | `{ id }` |
| `feed.status` | `bill: read` | none | `{ feed: { createdAt, lastUsedAt } \| null }` |
| `feed.create` | `bill: read` | none | `{ path }`. This replaces any link the caller already had. |
| `feed.revoke` | none | none | `{ revoked }`. It only touches the caller's own link. |

Viewers can read bills and subscribe. Owners, admins and members can also confirm payments.

## What is a bill

- **Recurring**: every occurrence an expense schedule posted, plus every occurrence an active schedule is still due to post. Days that were skipped by a pause or a re-timing were never owed, so they are not bills. Income schedules are left out.
- **Card, statement**: a recorded statement with a positive balance, on its due date.
- **Card, projected**: the card's `payment_due_day`, while the card owes something and no statement is within 15 days of that date. Projections start 30 days before today and never go further back. A projection has no amount, so the totals count it separately.

## Paid, overdue, expected

A bill is **paid** when one of these holds:

- A `bill_payment` row links a live, paid transaction to it.
- A member confirmed it explicitly (a `bill_payment` row with no transaction).
- For a card, transfers into the card cover it. For a statement, that means transfers dated after `period_end` and on or before the next statement's `period_end` add up to the balance. For a projection, it means any transfer after the previous due day and on or before this one.

An unpaid bill is **overdue** from the day after its due date, judged by the household's timezone. Until then it is **expected**.

A schedule posting its own transaction is **never** proof of payment. It only means the schedule ran. The posting is offered as the first candidate, so a member can link it with one click. Choosing it is the confirmation.

Totals are per currency and are never combined.

## The feed

- The token is 256 random bits in base64url. Only its SHA-256 is stored, in `bill_calendar_feed`, one row per member per household. The URL is shown once, when it is created.
- Each request re-checks that the token's user is still a member of the household and still holds `bill: read`. Removing someone from the household kills their feed without anyone having to revoke it.
- The events carry bill names, due dates and a paid/due/overdue word. They never carry amounts, balances or account names, because calendar apps sync the feed to their own servers and share it onward.
- Every failure (malformed, unknown, revoked or removed) returns the same `404`, so a caller cannot tell those cases apart.

## Things that bite

- **The token is in the path.** `honoLogger` excludes `/feeds/**`, and the nginx `/feeds/` location has `access_log off`. A new proxy in front of the server needs the same treatment.
- **`bill_payment.transaction_id` is unique.** One payment settles one bill. The same unique constraint covers `(schedule_id, due_date)` and `(account_id, due_date)`, so a double click answers `CONFLICT` instead of writing two rows.
- **A linked payment that is archived or marked unpaid stops counting**, but its row stays. Restoring the transaction makes the bill paid again. Unlinking is how a member frees the bill for a different payment.
- The web query key sits under `["accounts", organizationId]`, so any ledger write that invalidates accounts also refreshes the calendar.
