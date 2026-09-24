# CSV data export

Each dataset is an `orgProcedure` under `exports.*` (`packages/api/src/exports/exports.router.ts`) that returns `{ csv, fileName, rowCount }` for the **active household only**. The web app downloads them from **Settings → Household → Export data**. Files are generated synchronously from the canonical Postgres tables: there are no export tables, no queue and no storage.

## File format

- RFC 4180. Rows end in CRLF, including the last one. The header row comes first, and the column order below is stable. A field containing a comma, a double quote, CR or LF is wrapped in double quotes, and embedded quotes are doubled.
- UTF-8. The API returns the CSV without a BOM. The browser download adds a UTF-8 BOM so Excel reads `₱` and `ñ` correctly, so importers should strip a leading BOM.
- Empty field = `NULL`. Booleans are `true`/`false`.
- Dates (`*_date`, `period_*`) are `YYYY-MM-DD`. Timestamps (`*_at`) are ISO 8601 UTC, for example `2026-02-01T08:00:00.000Z`.
- Amounts are exact `numeric(30,6)` text from Postgres (`-1234.500000`), never floats. Transaction amounts are positive. Direction comes from `category_type` or `transfer_side`.
- Rows are ordered deterministically (see each dataset), and ties break on the UUID.
- **Formula injection:** a free-text column (names, notes, institution, import reference) whose value starts with `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'`, so spreadsheets show it as text. Typed columns (amounts, dates, ids, enums) are never touched, so negative amounts stay numeric. A re-importer should drop one leading `'` from a text column when the next character is one of those triggers.
- `; `-joined columns (`tag_names`, `owner_*`) are for reading convenience. The link datasets are the canonical form.
- Archived records are always included. Filter on `archived_at` rather than expecting them to be missing.

## Datasets

Permission is the existing `read` action on the resource shown. Every app role has it. A non-member or an unknown role gets `FORBIDDEN`.

### `transactions.csv` — `transaction: read`, by `transaction_date, id`

One row per posting, including archived postings and both sides of every transfer.

`id, transaction_date, account_id, account_name, amount, currency_code, category_id, category_name, category_type, split_count, tag_names, paid_status, notes, transfer_id, transfer_side, transfer_counterpart_account_id, transfer_counterpart_account_name, archived_at, created_at, updated_at`

`category_*` is empty for transfer postings. `split_count` is `0` unless the lines are in `transaction_splits.csv`.

### `transaction_splits.csv` — `transaction: read`, by `transaction_date, transaction_id, sort_order, id`

`id, transaction_id, transaction_date, account_id, account_name, sort_order, amount, currency_code, category_id, category_name, category_type, transaction_archived_at`

### `transaction_tags.csv` — `transaction: read`, by `transaction_date, transaction_id, lower(tag_name), tag_id`

`transaction_id, transaction_date, tag_id, tag_name, tag_archived_at`

### `transfers.csv` — `transaction: read`, by `transaction_date, id`

`id, transaction_date, source_account_id, source_account_name, source_amount, source_currency_code, source_transaction_id, destination_account_id, destination_account_name, destination_amount, destination_currency_code, destination_transaction_id, notes, created_at, updated_at`

### `accounts.csv` — `financialAccount: read`, by `account_class, name, id`

`id, name, account_class, account_type, liquidity, currency_code, include_in_net_worth, opening_balance, opening_balance_date, current_balance, institution, credit_limit, card_network, card_last_four, statement_closing_day, payment_due_day, owner_member_ids, owner_names, color, icon, notes, archived_at, created_at, updated_at`

`current_balance` is computed the same way as in the app (`accounts/balances.ts`): the opening balance plus unarchived postings on or after `opening_balance_date`.

### `account_balance_snapshots.csv` — `financialAccount: read`, by `effective_date, id`

`id, effective_date, account_id, account_name, balance, currency_code, source, import_reference, account_archived_at, created_at`

### `credit_card_statements.csv` — `financialAccount: read`, by `statement_date, id`

`id, statement_date, account_id, account_name, period_start, period_end, due_date, statement_balance, minimum_amount_due, currency_code, account_archived_at, created_at, updated_at`

### `categories.csv` — `category: read`, by `type, sort_order, name, id`

`id, name, type, color, icon, sort_order, archived_at, created_at, updated_at`

### `tags.csv` — `tag: read`, by `lower(name), id`

`id, name, color, archived_at, created_at, updated_at`

## Adding a column or dataset

Columns are declared once in `datasets.ts`, so a new one is one entry in that dataset's list, plus a line here. Mark it `text: true` if people type it. A new dataset is a builder plus an `EXPORT_DATASETS` entry and a router key. Every joined table must repeat the `organization_id` filter. `exports.router.db.test.ts` checks for cross-household leakage, and a join on the id alone would fail it.
