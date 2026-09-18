# seed

Populates a local database with usable dev data. Users only, for now — this is the pattern later seeders (posts, orgs, whatever comes next) will follow.

## Quick start

```bash
pnpm db:start && pnpm db:purge --yes && pnpm db:migrate
pnpm db:seed
```

Users are created through better-auth's own API (`auth.api.signUpEmail`), not raw inserts — so every seeded user gets a real hashed password, and the app's `databaseHooks` (see [packages/auth/src/index.ts](../../../../auth/src/index.ts)) fire exactly as they do on a real sign-up: a personal organization and a membership row, for free.

## What you get

Two fixed accounts, the same on every run:

| email               | password       | name     | role    |
| ------------------- | -------------- | -------- | ------- |
| `K1@gmail.com`      | `K1@gmail.com` | `K1`     | `admin` |
| `member@masdan.dev` | `password`     | `Member` | —       |

Plus, by default, 5 random users from faker, all with the password `password` so they're actually loggable-into: `pnpm db:seed --users 20` for more, `--users 0` for just the fixed two.

## Flags

```
pnpm db:seed [--users <n>] [--seed <n>] [--dry-run]
```

| flag | effect |
| --- | --- |
| `--users <n>` | random users to generate on top of the fixed ones (default 5) |
| `--seed <n>` | faker seed — same value, same generated names/emails (default 22) |
| `--dry-run` | plan and check for conflicts, then stop without writing anything |

## Conflicts fail loudly

There's no upsert and no silent skip. Before anything is written, every seeded email is checked against the database; if any already exist, the run stops, lists exactly which ones, and writes nothing at all — including the users that would otherwise have been new. Re-running `pnpm db:seed` on a database you've already seeded will hit this every time, on purpose:

```
Refusing to seed — some rows already exist:

  users:
    - user K1@gmail.com
    - user member@masdan.dev

Nothing was written. Reset with "pnpm db:purge --yes && pnpm db:migrate", then seed again.
```

That's the intended reset flow. This precedent — plan everything first, refuse on any collision, write only if the whole batch is clean — is meant to carry forward to every future seeder, not just this one.

## Adding a seeder

A seeder is `plan` → `conflicts` → `apply`, defined with `defineSeeder` from [`../define.ts`](./define.ts):

```ts
import { eq } from "drizzle-orm";

import { widget } from "../../../schema";
import { defineSeeder } from "../define";

export const widgetsSeeder = defineSeeder<{ widgets: NewWidget[] }>({
  name: "widgets",

  async plan({ faker }) {
    return { widgets: widgetFactory.buildList(10) };
  },

  async conflicts({ db }, { widgets }) {
    // check for pre-existing rows that would collide; return their keys
    return [];
  },

  async apply({ db, log }, { widgets }) {
    await db.insert(widget).values(widgets);
    log(`created ${widgets.length} widgets`);
  },
});
```

Then add it to the `SEEDERS` list in [`runner.ts`](./runner.ts). `plan` must not touch the database — it's also what powers `--dry-run`. `conflicts` runs for every seeder _before_ any seeder's `apply` runs, so one seeder finding a collision stops the whole run before a different seeder has written anything.

## Factories: fishery + faker

The users seeder doesn't need factories — `auth.api.signUpEmail` already plays that role. Anything seeded with a raw `db.insert(...)`, though, should build its rows with [fishery](https://github.com/thoughtbot/fishery) + [`@faker-js/faker`](https://fakerjs.dev) instead of hand-writing objects.

A factory is a function from an optional partial override to a full row:

```ts
// packages/db/src/dev-scripts/seed/seeders/widgets.factory.ts
import { faker } from "@faker-js/faker";
import { Factory } from "fishery";

import type { widget } from "../../../schema";

type NewWidget = typeof widget.$inferInsert;

export const widgetFactory = Factory.define<NewWidget>(
  ({ sequence, params }) => ({
    name: params.name ?? faker.commerce.productName(),
    slug: faker.helpers.slugify(`widget-${sequence}`).toLowerCase(),
    description: faker.lorem.sentence(),
    ownerId: params.ownerId!, // no sensible default — pass it in from the seeder
  })
);
```

Use it from a seeder's `plan`:

```ts
widgetFactory.build(); // one row, everything defaulted
widgetFactory.build({ name: "Custom name" }); // override a field
widgetFactory.buildList(20, { ownerId }); // twenty, sharing an owner
widgetFactory.params({ description: "" }).buildList(5); // reusable override set
```

A factory only builds plain objects — it never touches the database. The seeder's `apply` does the actual `db.insert(...)`. And `faker.seed(...)` is already called once per run by the CLI's `--seed` flag before any seeder's `plan` runs, so a factory built from the shared `faker` import is reproducible for free — no need to seed it again yourself.

See the [fishery](https://github.com/thoughtbot/fishery#readme) and [faker](https://fakerjs.dev/api/) docs for the full API — associations, traits (`Factory.define` + `.params`), `afterBuild`, and faker's full module list (`faker.commerce`, `faker.date`, `faker.helpers.arrayElement`, ...).
