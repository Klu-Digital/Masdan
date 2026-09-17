# Background jobs

Job queue for this template, backed by [pg-boss](https://pgboss.io) on the Postgres you already run — **no Redis, no broker, no extra container.**

The deciding reason is transactional enqueue. `@k22i/api` already wraps mutations in a Drizzle transaction, so a job can be written on that same connection: it commits with the rows it depends on, and vanishes if they roll back. A Redis- or AMQP-backed queue cannot do that without you building an outbox.

---

## The shape

Two processes, one registry.

```
packages/queue/src/jobs.ts          the registry — names, payloads, queue settings
        ↓                                    ↓
  producer (apps/server)              consumer (apps/workers)
  queue.enqueue(...)                  queue.work(...) via register.ts
```

Neither side declares a queue name or a payload shape of its own, so they cannot drift apart. `queue.start(role)` creates every queue in the registry on boot — `createQueue` is idempotent, so **a new job needs no migration.**

|                  | Producer (`apps/server`) | Consumer (`apps/workers`) |
| ---------------- | ------------------------ | ------------------------- |
| Enqueues         | yes                      | yes                       |
| Runs handlers    | no                       | yes                       |
| Runs cron        | no                       | yes                       |
| Runs maintenance | no                       | yes                       |

Splitting the roles is what keeps queue maintenance off the request path, and stops a scaled-out API tier from multiplying the maintenance load.

---

## Adding a job

### 1. Declare it

In [`src/jobs.ts`](./src/jobs.ts):

```ts
"file.process": {
  schema: z.object({ fileId: z.uuid() }),
  queue: { retryLimit: 5, retryBackoff: true, expireInSeconds: 600 },
},
```

Keep payload schemas plain — **no `.default()` or other transforms.** `enqueue` accepts the schema's inferred _output_ type, so an input/output mismatch would make every call site's type a lie.

### 2. Write the handler

In `apps/workers/src/handlers/`:

```ts
import type { JobOf } from "@k22i/queue";

export async function handleFileProcess(
  job: JobOf<"file.process">
): Promise<void> {
  const { fileId } = job.data; // typed from the registry, already validated
  // ...
}
```

### 3. Register it

In `apps/workers/src/register.ts`:

```ts
const handlers: Handlers = {
  "example.echo": handleEcho,
  "file.process": handleFileProcess, // ← new
};
```

`Handlers` is a mapped type over `JobName`, so this step is not bookkeeping — skipping it is a compile error. A queue can never end up accumulating jobs with nothing consuming them.

---

## Enqueueing — the transaction rule

**Pass `tx` only from a procedure that actually has a transaction.** That means `mutationProcedure` and `orgMutationProcedure`, whose middleware rebinds `context.db` to the running `tx`. It does _not_ include `protectedProcedure` or `orgProcedure`.

```ts
processUpload: orgMutationProcedure
  .input(z.object({ fileId: z.uuid() }))
  .handler(async ({ context, input }) => {
    const [row] = await context.db
      .update(file)
      .set({ status: "processing" })
      .where(eq(file.id, input.fileId))
      .returning();

    if (!row) throw new ORPCError("NOT_FOUND");

    // Same transaction as the UPDATE above: either the row says "processing"
    // AND a job exists to make that true, or neither happened.
    await queue.enqueue("file.process", { fileId: row.id }, { tx: context.db });

    return { fileId: row.id };
  }),
```

On a non-mutation procedure, omit it:

```ts
await queue.enqueue("file.process", { fileId: row.id });
```

**The failure mode is silent.** Passing the `db` singleton as `tx` from a non-mutation procedure does not throw — the job is written and auto-commits — so you get no atomicity while the code reads as though you did. `storage.confirmUpload` is deliberately an `orgProcedure` for exactly this kind of reason; enqueue from it without `tx`.

### Options

Everything pg-boss accepts on `send`, minus `db`, plus `tx`:

```ts
// Run it later — seconds, an ISO string, or a Date
await queue.enqueue("report.build", { orgId }, { tx, startAfter: 300 });

// Collapse duplicates: one job per key per hour
await queue.enqueue(
  "digest.send",
  { userId },
  { tx, singletonKey: userId, singletonSeconds: 3600 }
);

// Override the queue's own policy for this one job
await queue.enqueue(
  "file.process",
  { fileId },
  { tx, retryLimit: 10, priority: 10 }
);
```

Payloads are validated **before** the write, so a bad one throws a zod error at the call site rather than failing in a worker minutes later — and again on the way out in the handler, in case an older deploy wrote a different shape.

---

## Handlers

pg-boss hands workers a _batch_; `queue.work` unwraps it so handlers deal with one job at a time. Throwing marks the job failed and hands it back for retry according to the queue's `retryLimit`. So: throw on failures a later attempt might survive, and log-and-return the ones that never will.

`batchSize` defaults to 1, so by default a throw fails exactly the job that threw. **If you raise `batchSize`, a throw fails and retries the whole batch** — including jobs in it that already succeeded. Reach for pg-boss's `perJobResults` via `queue.raw()` if you need per-job settlement.

Jobs carry an `AbortSignal` (`job.signal`) that fires when the job is expiring; pass it to `fetch` and anything else that takes one.

### Queue policies

Set per job via `queue.policy`. `standard` (the default) is usually right.

| Policy            | Effect                           |
| ----------------- | -------------------------------- |
| `standard`        | Deferral, priority, throttling   |
| `short`           | Only one job queued at a time    |
| `singleton`       | Only one job _active_ at a time  |
| `stately`         | One job per state                |
| `exclusive`       | One job total, queued or active  |
| `key_strict_fifo` | FIFO ordering per `singletonKey` |

### Cron

Add a `cron` block to the registry entry. Only the consumer registers schedules.

```ts
"reports.nightly": {
  schema: z.object({ scope: z.enum(["all", "active"]) }),
  queue: { policy: "singleton", retryLimit: 0 },
  cron: { expression: "0 3 * * *", data: { scope: "active" }, tz: "UTC" },
},
```

A unit test asserts every `cron.data` satisfies its own job's schema — otherwise a typo there surfaces as a failing job hours later, on a queue nobody is watching.

---

## Schema and migrations

**pg-boss needs no Drizzle migration.** It owns its own schema (`pgboss` by default) with its own migration system and its own version table. Drizzle only ever sees `public`, and `drizzle.config.ts` sets `schemaFilter: ["public"]` so `db:push` cannot reach across.

```bash
pnpm queue:migrate           # apply pg-boss's schema migrations
pnpm queue:migrate doctor    # check for schema/index drift
pnpm queue:migrate version   # current schema version
```

`pnpm db:deploy` runs all three steps in order:

```
drizzle-kit migrate  →  pg-boss migrate  →  post-migration scripts
```

Post-migration scripts run last, so one can enqueue a job if it needs to.

**Neither app process ever issues DDL** — both boot with `migrate: false` and `createSchema: false`. A bad deploy fails at the migrate step, not halfway through a worker's first start. In production, only the role running `queue:migrate` needs `CREATE` on the database.

`pnpm db:purge` drops the `pgboss` schema along with `public`, so a local reset does not strand jobs pointing at rows that no longer exist.

---

## Running it locally

```bash
pnpm db:start        # postgres on :4400
pnpm db:deploy       # includes the pg-boss schema
pnpm dev:server      # producer
pnpm dev:workers     # consumer
```

`apps/workers` needs its own `.env` — run `pnpm secrets:setup` or copy [`apps/workers/.env.example`](../../apps/workers/.env.example). Workers use the shared backend schema and do not need Better Auth or CORS configuration.

To exercise the round trip, call `jobs.enqueueExample` and watch the worker log the echo within about a second. `packages/api/src/routers/jobs.ts` and the `example.*` registry entries exist only for this — delete them once real jobs replace them.

---

## Testing

`@k22i/testing` exports helpers that drive handlers **without** a polling worker, so tests have no interval to wait out and no timers to fake:

```ts
import {
  drainQueue,
  getQueuedJobs,
  startTestQueue,
  stopTestQueue,
} from "@k22i/testing";

beforeAll(startTestQueue);
afterAll(stopTestQueue);

it("discards the job when the transaction rolls back", async () => {
  await expect(
    getTestDb().transaction(async (tx) => {
      await queue.enqueue("example.echo", { message: "nope" }, { tx });
      throw new Error("boom");
    })
  ).rejects.toThrow("boom");

  expect(await getQueuedJobs("example.echo")).toHaveLength(0);
});
```

`drainQueue(name, handler)` fetches whatever is queued, runs the handler, and settles each job the way a real worker would — completing on success, failing on a throw — then returns how many it processed. `getJobs` / `getQueuedJobs` are for assertions.

Queue tests must be `*.db.test.ts` (the `db` project). The test template database installs the pg-boss schema once in `globalSetup`, so every Vitest worker's clone already has it, and `truncateAll()` clears `pgboss.job` between tests — queues and schedules survive, since they are schema rather than data.

---

## Configuration

All optional; every one has a working default.

| Variable | Default | What it does |
| --- | --- | --- |
| `PGBOSS_SCHEMA` | `pgboss` | Schema pg-boss owns. Kept out of `public` so Drizzle never sees it. |
| `QUEUE_POOL_MAX` | `10` | Connections pg-boss holds, per process. Separate from the app pool. |
| `QUEUE_LISTEN_NOTIFY` | `true` | Wake workers on NOTIFY instead of waiting out the poll. |
| `WORKERS_PORT` | `1901` | Health + metrics server. Not an API. |
| `WORKERS_CONCURRENCY` | `1` | Workers spawned per queue, per process. |
| `WORKERS_POLLING_INTERVAL_SECONDS` | `2` | Poll interval. The correctness floor under LISTEN/NOTIFY. |
| `SERVICE_NAME` | `k22i-server` | Tags log lines. `apps/workers` sets `k22i-workers`. |

**Turn `QUEUE_LISTEN_NOTIFY` off behind PgBouncer in transaction pooling mode.** It needs a session-pinned connection. Polling still runs underneath, so the only cost is latency — jobs are dispatched within `WORKERS_POLLING_INTERVAL_SECONDS` instead of milliseconds.

---

## Operating

The worker exposes `GET /` on `WORKERS_PORT`, which reports the _queue connection_ rather than mere process liveness — a worker that is running but detached from Postgres is exactly the failure a healthcheck should catch. Compose uses it.

With `PROMETHEUS_METRICS_PATH` and `PROMETHEUS_METRICS_TOKEN` set, the same server exposes `k22i_queue_jobs{queue,state}` — queued, active, deferred and total per queue, sampled at scrape time in a single query.

On `SIGTERM` the worker stops polling, waits for in-flight handlers to finish, then flushes logs. Jobs are completed rather than abandoned to expire and retry.

Failed jobs stay in `pgboss.job` with `state = 'failed'` and the error in `output`. Set `deadLetter` on a queue to route them somewhere on exhaustion, and `redrive()` (via `queue.raw()`) to move them back.

---

## Files

| File | What it holds |
| --- | --- |
| `packages/queue/src/jobs.ts` | The registry. Edit this first. |
| `packages/queue/src/index.ts` | `queue` client — `start`, `enqueue`, `work`, `stop`, `raw`. |
| `packages/queue/src/config.ts` | Constructor options per role. |
| `packages/queue/src/cli/migrate.ts` | `pnpm queue:migrate`. |
| `apps/workers/src/register.ts` | Job → handler map. The exhaustiveness check lives here. |
| `apps/workers/src/handlers/` | The handlers themselves. |
| `packages/testing/src/queue.ts` | `drainQueue`, `getJobs`, `startTestQueue`. |

`queue.raw()` returns the underlying `PgBoss` instance for everything this wrapper deliberately does not cover — flows, groups, `redrive`, `getQueueStats`.
