---
status: accepted
---

# Routers are transport; logic lives in queries and commands

Business logic had accumulated in oRPC routers (the largest were 800+ lines), routers imported each other, and helpers were copied per feature. Workers and the Telegram adapter could not reuse the logic without importing a router, and cycles followed.

A `*.router.ts` now holds only input schemas, the procedure rung, permissions and a call into the feature's `*.queries.ts` (reads) or `*.commands.ts` (writes), which are plain `(db, organizationId, …)` functions. Cross-feature helpers live in `packages/api/src/shared/`. Only `routers/index.ts` and `routers/admin.ts` may import a router; an oxlint `no-restricted-imports` rule enforces it, because a convention alone did not stop the cycles.

The same tenant-scoped functions are what workers, chat entry and Ask call, so there is one definition of each read and write.
