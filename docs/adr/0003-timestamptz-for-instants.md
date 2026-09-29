---
status: accepted; implementation tracked in #46
---

# Instants are `timestamptz`; calendar days are `date`

Every timestamp column was `timestamp without time zone`, so what a value meant depended on the connection's time zone, while households have time zones of their own. Columns that record an instant (`created_at`, session and token expiry) are `timestamptz`, as Postgres guidance recommends, including better-auth's tables. Values that are calendar days, such as `transaction_date`, stay `date` and are interpreted in the household's time zone ("household date"), never converted through an instant.

One migration alters every column with `USING col AT TIME ZONE 'UTC'`, which is correct only because every writer stores UTC; that has to be confirmed before it runs. Shared column helpers in `packages/db/src/schema/columns.ts` keep new tables from reintroducing the bare `timestamp`.
