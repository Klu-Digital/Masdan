/**
 * The env floor for every test project. There is no root `.env`, so this is the
 * only source of these vars during tests; `??=` lets the shell, CI, or
 * `setup/db.ts` win. The dead-port `DATABASE_URL` is safe because `pg.Pool`
 * only dials on first query. `REDIS_URL` deliberately has no placeholder:
 * ioredis dials on the first command, so a dead port would give any
 * cache-touching unit test an ECONNREFUSED retry storm.
 */
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:password@127.0.0.1:1/unused";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters!!";
process.env.BETTER_AUTH_URL ??= "http://localhost:1900";
process.env.CORS_ORIGIN ??= "http://localhost:2600";
