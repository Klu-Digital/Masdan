import { env } from "@masdan/env/shared-server";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgClient, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolConfig } from "pg";

import { relations } from "./relations";

export type Database = NodePgDatabase<typeof relations>;

export const createDb = (client?: NodePgClient): Database =>
  client
    ? drizzle({ client, relations })
    : drizzle(env.DATABASE_URL, { relations });

export const createPool = (config?: PoolConfig): Pool =>
  new Pool({ connectionString: env.DATABASE_URL, ...config });

export const db: Database = createDb();
