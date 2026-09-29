---
status: accepted
---

# Optional infrastructure fails open, except security and cost limits

Redis, object storage and the queue are optional, and callers degrade when they are absent: with `REDIS_URL` unset the cache is a pass-through and the server boots normally. That is right for a cache and wrong for a limiter. With the same rule applied to rate limits, a missing Redis silently removed the AI request limits and the Telegram link-code limit, and link codes are only 40 bits, so that limiter is the only thing stopping guessing.

Security and cost limits therefore never vanish. Rate limits count through `countHit` in `@masdan/redis`, which falls back to an in-process window when Redis is absent or errors (per process, so looser across replicas, but never open). Every AI call sends a per-feature `max_tokens` and is charged against a per-household daily token budget kept in Postgres (`ai_usage`), so the budget survives Redis being off.

New callers must follow both halves: degrade for caching, count for limits.
