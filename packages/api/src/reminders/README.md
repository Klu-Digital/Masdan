# Credit-card reminders

In-app reminders for card statement closing dates and payment due dates. The worker writes them to `credit_card_reminder`, and the top-bar bell in the web app reads them through `reminders.*` (`reminders.router.ts`). Nothing is emailed.

## Procedures

| Procedure | Permission | Input | Output |
| --- | --- | --- | --- |
| `list` | `reminder: read`, `financialAccount: read` | none | `{ today, items[] }`, soonest first |
| `dismiss` | `reminder: dismiss` | `{ reminderId }` | `{ id, status }` |
| `restore` | `reminder: dismiss` | `{ reminderId }` | `{ id, status }` (undoes a dismissal) |

Each item carries the card, `kind` (`statement` or `payment`), `eventDate`, `daysLeft` (negative once the date has passed), `source` (`statement` when the due date comes from a recorded statement, `card` when it is projected from the card's due day), `statementBalance`, `minimumAmountDue`, `paidAmount` and `minimumPaid`. Viewers can read reminders. Only owners, admins and members can dismiss them, and a dismissal applies to the whole household.

## Where the dates come from

The rules live in `reminder-rules.ts` and are pure and unit-tested. Every date is a household calendar day in `organization.timezone`.

- **Statement closing**: from the card's `statement_closing_day`, clamped to the length of each month. The reminder surfaces 7 days ahead. It stays actionable for 10 days after closing, until a statement dated within a week of the closing day is recorded.
- **Payment due**: from the latest statement's `due_date` when its balance is positive. Without one, the due date is projected from the card's `payment_due_day` while the card has a balance. A recorded due date within 15 days of the projected one takes its place. The reminder surfaces 7 days ahead.

## When a reminder stops being actionable

| Resolution | When |
| --- | --- |
| `recorded` | A statement reminder's statement was recorded. |
| `paid` | Transfers into the card dated after `payments_after` cover the statement balance, or the card's balance is zero or less. A projected payment counts as paid after any payment in the cycle. |
| `superseded` | A newer statement replaced the one the payment reminder came from, or a statement took over a projected payment. |
| `expired` | A closing date is 10 days past, or a payment is 30 days overdue. |
| `account_archived` | The card was archived. |

`payments_after` is the statement's `period_end`, or the previous due day for a projection. Payments made before the period closed are already reflected in the statement balance.

## Worker

- `reminders.sweep` runs hourly at minute 7 and enqueues `reminders.refresh` for each household that has an open card with a closing day, a due day or a statement, plus each household that still has active reminders.
- `reminders.refresh` handles one household: it inserts candidates with `ON CONFLICT DO NOTHING` on `(account_id, kind, event_date)`, then resolves any stale ones. Running it twice, or in parallel, does no harm.
- `accounts.create`, `update`, `restore` and `createStatement` enqueue a refresh on the mutation's transaction for credit cards. The queue has a `stately` policy with the household id as `singletonKey`, so a burst of edits leaves only one queued refresh.

## Things that bite

- **The unique index is what deduplicates.** A dismissed or resolved row is never deleted. Deleting it would let the next sweep generate the same date again.
- **`list` judges each reminder live.** It applies the same `reminderResolution` as the worker, so a payment hides its reminder straight away, without waiting for the next sweep. New reminders appear only after a worker run. The web client refetches every 5 minutes and whenever the window regains focus.
- The web query key sits under `["accounts", organizationId]`, so any ledger or account write that invalidates accounts also refreshes the bell.
