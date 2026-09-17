# purge

Drops and recreates the `public` and `drizzle` schemas — every table and row in the database is gone. There is no undo.

```bash
pnpm db:purge --yes
```

Nothing happens without `--yes` — it just prints usage and exits. Refuses to run at all when `NODE_ENV` is `"production"`; this tool has no production use case.

If the app's tables live in a schema other than `public`, override it:

```bash
pnpm db:purge --yes --schema my_schema
```

The `drizzle` schema (drizzle-kit's own migration bookkeeping) is always dropped and recreated alongside it, regardless of `--schema`.

After purging, rebuild the schema from the migrations:

```bash
pnpm db:migrate
```
