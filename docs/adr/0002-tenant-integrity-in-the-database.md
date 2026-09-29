---
status: accepted; implemented in #45
---

# The database enforces household and ledger integrity

Application code was the only thing keeping one household's rows away from another's: nothing stopped `financial_transaction.account_id` pointing at another household's account except the write path. A single missed check in a new procedure would become a cross-tenant write the database accepts. We move the guarantee into the schema so that a bug in a procedure fails loudly instead of leaking data.

- **Composite foreign keys.** Parent tables get `UNIQUE (organization_id, id)`; children reference `(organization_id, <parent>_id)`.
- **`ON DELETE RESTRICT` for ledger references.** Only deleting an `organization` cascades. Accounts and categories are archived, never deleted, so a stray hard delete must not silently erase ledger history.
- **`CHECK` constraints** for invariants the code already assumes, such as a positive transaction amount.
- **Balance helpers take `organizationId`**, like every other query.

## Consequences

`drizzle-kit generate` cannot emit these constraints safely against existing data, so migrations for them are hand-edited: add each foreign key `NOT VALID`, then `VALIDATE CONSTRAINT` in a separate statement so the table is not locked for the scan. Validate them on a scratch database, because `pnpm db:deploy` fails on the push-built local database. This is why AGENTS.md no longer says migrations are never hand-edited.

Join tables (tags, splits, attachments, owners) gained their own `organization_id`, because a composite key needs the household on both sides. A `SET NULL` reference, such as `transaction_import_row.transaction_id`, is narrowed to `SET NULL (<column>)` in the SQL. Drizzle cannot express that form, and nulling `organization_id` as well would violate its `NOT NULL`. `chat_inbound_message.organization_id` is nullable because a message's household is unknown until the message is processed.
