# Issue #7 Implementation Plan

## Context

- Scope is **GitHub issue #7 only**: “Add income and expense transaction lifecycle.”
- Epic #24 places #7 after household profile, categories, tags, accounts, and credit-card metadata; #8 (transaction table/search/filtering), #9 (splits), and #10 (transfers) are separate follow-ons.
- Issue requirements include household-scoped income/expense records, account/category/tags/notes, paid/billing status, CRUD plus soft-delete/restore, balance consistency, typed oRPC APIs, entry/detail UI, finance permissions, and server-side household isolation.
- The PRD’s relevant boundaries are: transactions support Expense and Income (transfers are separate), categories classify income or expenses, tags are many-to-many, balances are derived from opening balance plus ledger movements, historical records should remain auditable, and financial queries must be household-scoped.
- Existing `PLAN.md` is an unrelated prior issue #6 plan; this plan uses `plans/issue-7.md` and does not modify that file.

## Approach

1. **Add one finance ledger model, not a mutable balance column.** Create a `financial_transaction` table with household, account, positive fixed-precision amount, account currency snapshot, income/expense type, transaction date, explicit `paid`/`unpaid` status, notes, timestamps, and `archivedAt` for soft deletion. Add a transaction-to-tag join table. Reuse the repository’s archive/restore vocabulary; keep transfers, splits, merchant normalization, attachments, imports, and statement logic out of this issue.
2. **Centralize balance derivation.** Reuse the account opening balance and calculate current account balance as opening balance plus active transaction movements. Store amounts as decimal strings (`numeric(30,6)`), never JavaScript numbers. Use one shared balance helper/query for account list/detail responses and transaction mutations so create, edit, account moves, type/date changes, archive, and restore cannot drift.
3. **Validate all related rows inside the organization boundary.** Create/update must require an active account, a category whose type matches the transaction type, and tag IDs from the active household; archived categories/tags remain readable on historical records but are not offered for new selections. Query predicates must include `organizationId`; missing or cross-household IDs return the existing not-found behavior.
4. **Expose a typed transactional API.** Add a tenant-scoped transactions router with `list` (small recent/index surface only), `get`, `create`, `update`, `archive`, and `restore`, mount it in `appRouter`, and add a finance transaction permission resource using the existing create/read/update/archive/restore role shape. Mutations use `orgMutationProcedure`; transaction/tag writes happen in the same DB transaction.
5. **Ship the narrow web vertical slice.** Add a simple Transactions route as an entry point/recent list, a create/edit form, and a detail route with archive/restore. Reuse account/category/tag query patterns, TanStack Form + Zod, shared controls, `DatePicker`, and static permission checks. The index must not become issue #8’s searchable/filterable/sortable data grid.

Balance sign convention for the plan: transaction amounts are positive; an asset expense decreases balance, asset income increases it, a liability expense increases the amount owed, and liability income decreases it. This keeps account balances positive in their native meaning while treating transfers as a later separate feature.

## Files to modify

Likely source files (confirm names while implementing):

- `packages/db/src/schema/transactions.ts` (new), `packages/db/src/schema/index.ts`, `packages/db/src/relations.ts`, and a generated Drizzle migration.
- `packages/auth/src/permissions.ts` and its permission test for the transaction resource/role matrix.
- `packages/api/src/transactions/constants.ts` (new), `packages/api/src/transactions/transactions.router.ts` (new), `packages/api/src/transactions/transactions.router.db.test.ts` (new), `packages/api/src/accounts/balances.ts` (new shared balance query/helper), and `packages/api/src/accounts/accounts.router.ts` to return derived balances.
- `packages/api/src/routers/index.ts` to mount `transactionsRouter`.
- `apps/web/src/modules/transactions/queries.ts` and transaction components/tests (new), plus transaction routes under `apps/web/src/routes/_auth/transactions*` and `apps/web/src/components/app-sidebar.tsx` if navigation is needed.
- `apps/web/src/routes/_auth/accounts.$accountId.tsx` only if the smallest discoverable recent-transaction/quick-add link belongs on the existing account detail page.

Generated `apps/web/src/routeTree.gen.ts` and migration `snapshot.json` remain untouched per repository instructions.

## Reuse

Initial findings:

- `packages/api/src/procedures.ts`: use `orgProcedure` for reads and `orgMutationProcedure` for transactional mutations; gate with `requirePermission`.
- `packages/auth/src/permissions.ts`: existing `category`, `tag`, and `financialAccount` resources establish the RBAC shape; add a transaction resource rather than relying on UI checks.
- `packages/db/src/schema/financial-accounts.ts`: financial accounts already store opening balance/date and account currency; transaction balance arithmetic must extend this model rather than add an unrelated mutable current balance.
- `packages/db/src/schema/categories.ts` and `packages/db/src/schema/tags.ts`: archived household-owned entities and organization-scoped indexes are the association patterns to follow.
- `packages/api/src/accounts/accounts.router.ts`, `packages/api/src/categories/categories.router.ts`, and `packages/api/src/tags/tags.router.ts`: typed validation, household predicates, archive/restore, not-found errors, and DB integration-test conventions are already established.
- `packages/api/src/routers/index.ts`: the new router must be mounted in the tenant-scoped app router.

User decisions captured:

- Paid/billing status: explicit persisted editable status.
- UI boundary: create/edit/detail and soft-delete/restore entry flows; no full search/filter/sort table owned by #8.

## Steps

- [x] Read issue #7, epic #24, the PRD, repository status, and issue list with `gh`.
- [x] Read issue comments and dependency issue details for implementation constraints; #7 has no comments, and #3/#4/#5 define the existing category, tag, and account contracts.
- [x] Trace existing account, category, tag, auth/RBAC, balance, API, web UI, and test patterns.
- [x] Define the smallest issue-#7-only data model and lifecycle semantics, explicitly excluding transfers, splits, attachments, and transaction-list search/filtering.
- [x] Add the transaction schema, tag join, relations, migration, constants, and transaction permission matrix.
- [x] Add the shared derived-balance query and update account API responses to use it.
- [x] Implement and mount the transactional oRPC router with relation validation, tag replacement on update, archive/restore, and household predicates.
- [x] Add the narrow web entry/recent list, create/edit form, detail, and archive/restore flows with query invalidation.
- [x] Add focused DB/API/web tests, run formatting/type/lint checks, and verify the migration deployment path.

## Verification

- DB/API integration tests using the existing `signUpTestUser`/`getTestDb` pattern:
  - create income and expense rows with decimal precision and explicit paid status;
  - reject invalid amounts, mismatched category types, inactive/missing accounts, and cross-household account/category/tag IDs;
  - attach multiple tags and return archived related records on detail;
  - verify derived balances after create, amount/type/account/date edits, archive, and restore, including asset and liability sign behavior;
  - verify list/get/mutations are household-isolated and permission-denied for viewer/member cases as defined by the new RBAC resource.
- Web tests for opening the entry form, type-dependent category choices, account/category/tag/status/date/amount/notes submission, detail rendering, edit, and archive/restore controls; keep the index test limited to recent records and navigation rather than #8 features.
- Run focused checks first with the repository runner: `pnpm exec vp test run --project db packages/api/src/transactions/transactions.router.db.test.ts`, the relevant auth/API tests, and the transaction web test. Then run `pnpm check` and `pnpm check-types`.
- The generated migration was applied successfully by the clean DB integration-test setup. `pnpm db:deploy` was also attempted locally but is blocked by pre-existing database drift: the local database already has the base tables while `drizzle.__drizzle_migrations` is empty, so Drizzle retries the initial `account` table creation. Do not reset this database as part of issue #7.

## Execution result

- `pnpm test`: 51 files / 301 tests passed.
- `pnpm check` and `pnpm check-types` passed.
- Focused DB, auth, and web transaction tests passed.
- The only verification residual is the pre-existing local migration-history mismatch described above; the issue-#7 migration itself is covered by the clean DB test setup.

## Resolved scope decisions

- Paid/billing status is an explicit editable `paid`/`unpaid` field for this slice; due dates, statement status, and automatic billing semantics stay with credit-card statement work.
- The web scope is entry + detail, with only the minimal recent/index surface needed to discover records. Issue #8 owns full transaction table/search/filter/sort/bulk behavior.
- Transactions use archive/restore rather than hard deletion; archived rows remain available to historical detail and do not affect derived balances.
- Transfers, split transactions, attachments, merchants, imports, FX conversions, recurring entries, and reporting are explicitly out of scope.
