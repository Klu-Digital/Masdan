# Ask Masdan

Ask Masdan is the active household’s finance assistant, available from the app header in a closeable, non-modal right sidebar (a docked panel on phones). Conversations and in-flight requests persist while navigating or closing the panel. It answers questions across the full ledger history, accounts, statements, budgets, bills, goals, schedules, categories, tags, rules, imports and other household features. It can propose the same financial operations the member can perform in the normal screens. It cannot administer the platform, ban users, change membership or access other households.

## Reads and conversations

`ask.question` is an `orgProcedure` behind `FF__ASK_MASDAN`, `transaction: read` and the existing rate limiter. `ask.assistant.ts` runs a bounded JSON planning loop through `completeJson`; every model call has the feature’s token cap and charges the household’s daily allowance using the request database, never a transaction handle.

The model discovers input schemas on demand, then calls read tools or proposes writes. `routers/index.ts` supplies only the household product routers to `createAskTools`. Procedure discovery uses the original household and permission middleware, with only the currency list and interest catalog allowed as household-free reference reads. Authentication, invitations, feature-flag administration and the platform router never enter the tool catalog. `files.confirmUpload` is explicitly a write even though its original route is an `orgProcedure`. Other AI planners (quick entry and categorization) are not tools: Ask performs that planning itself, avoiding draft writes before confirmation and token charges through a confirmation transaction. Household member reads support assigning account owners, but membership edits remain unavailable.

Tools execute via oRPC `call()`, never by invoking handlers directly. Existing input validation, permissions, flags, ownership checks and transaction behavior remain authoritative. IDs for changes must have appeared in this request’s authorized read results. Notes and other record contents are untrusted data, not instructions. Bearer links and linking codes are shown to the user but redacted from model sources and conversation context.

The six existing report intents retain their deterministic, ledger-computed answers through `ask.plan.ts` and `ask.queries.ts`. Broader answers are model-written with the queried inputs and results shown as verified sources. Transactions have no implicit date filter, and aggregate/paginated reads can cover all history; truncated results are explicitly marked, not passed off as complete. Conversation context comes from server-owned `ask_turn` records, scoped to both household and requesting user, rather than client-supplied assistant messages. Follow-ups retain the relevant question context.

The loop permits 10 rounds, 24 reads and 20 proposed actions. Tool results and total model context are bounded. Large requests must be narrowed or split; these limits do not silently apply only the first matching transactions. Uploading actual file bytes and changing personal appearance remain browser controls, not model operations.

## Confirmed writes

`ask.question` never executes a financial write. It stores a proposal in Postgres and returns an exact schema-normalized preview with household record labels, references to earlier creation steps and a 15-minute expiry. Multiple actions can create a category/tag/rule and then use the created IDs in later actions using `{"$action":0,"path":"id"}`. A rule application still has to match the existing rule engine; it is not an arbitrary attachment.

`ask.confirm` accepts only the opaque request ID. The plan comes from the stored record, not the client. It:

1. Locks the user’s own household proposal.
2. Rejects expired/cancelled plans and rechecks current permissions.
3. Repeats the observed reads and rejects stale previews.
4. Runs all actions through their original procedures in a serializable transaction, resolving earlier created IDs.
5. Stores the outcomes and application time atomically, so concurrent confirmations and retries do not duplicate records.

A later failure rolls back the entire batch. The existing bulk operation may deliberately skip ineligible rows; its actual updated/skipped results remain visible rather than claiming all rows changed. Serialization/deadlock retries are bounded. Nested mutations share the outer `afterCommit` queue, and file-byte deletion also waits for commit. Queue writes keep using the transaction.

`ask.cancel` revokes an unapplied proposal. Merely saying “confirmed” in a question does not perform a write. The UI disables duplicate submissions, shows inline failures and saved outcomes, hides financial conversations in privacy mode, remounts on household switches and invalidates household caches after confirmation.

## Deployment and tests

Run `pnpm db:deploy` to create `ask_turn`; no backfill is needed. The existing AI gateway/model configuration and feature flag are still required. The default `askMasdan` output cap is 8,000 tokens to fit compound plans; existing admin overrides remain authoritative.

`ask.golden.ts` and `ask.test.ts` retain the report extraction eval set. `ask.db.test.ts` exercises real household procedures with only the gateway mocked: exact reports, full-history reads, dependent writes, permission changes, isolation, expiry, cancellation, replay, concurrency, stale previews and atomic rollback. The web tests cover conversation context, exact previews, explicit confirmation, cancellation, pending/error states and privacy.
