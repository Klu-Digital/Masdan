import type { Database } from "@masdan/db";
import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import { notFound } from "./errors";

/** Any household-scoped table: a row id plus the tenant it belongs to. */
type OwnedTable = PgTable & { id: AnyPgColumn; organizationId: AnyPgColumn };

export interface OwnedKey {
  id: string;
  organizationId: string;
}

/** The row, only if it is this household's: a foreign id matches nothing. */
const ownedRow = (table: OwnedTable, key: OwnedKey) =>
  and(eq(table.id, key.id), eq(table.organizationId, key.organizationId));

const selectOwned = (db: Database, table: OwnedTable, key: OwnedKey) =>
  db.select().from(table).where(ownedRow(table, key));

/** Loads a household's row or throws NOT_FOUND naming `entity`. */
export const findOwned = async <T extends OwnedTable>(
  db: Database,
  table: T,
  key: OwnedKey,
  entity: string
): Promise<InferSelectModel<T>> => {
  const [row] = await selectOwned(db, table, key).limit(1);
  if (!row) {
    throw notFound(entity);
  }
  return row as InferSelectModel<T>;
};

/** `findOwned` plus a row lock held until the caller's transaction ends. */
export const lockOwned = async <T extends OwnedTable>(
  db: Database,
  table: T,
  key: OwnedKey,
  entity: string,
  strength: "share" | "update" = "update"
): Promise<InferSelectModel<T>> => {
  const [row] = await selectOwned(db, table, key).for(strength).limit(1);
  if (!row) {
    throw notFound(entity);
  }
  return row as InferSelectModel<T>;
};
