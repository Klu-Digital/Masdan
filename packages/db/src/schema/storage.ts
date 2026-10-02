import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { oneOf, timestamps } from "./columns";

/** Postgres 18+ native time-ordered UUID, used as the default for every id column. */
const uuidv7 = sql`uuidv7()`;

export const fileStatuses = ["pending", "ready", "failed"] as const;
export type FileStatus = (typeof fileStatuses)[number];

// `pending` until `confirmUpload` verifies the object landed.
export const file = pgTable(
  "file",
  {
    bucket: text("bucket").notNull(),
    /** ETag from HeadObject. */
    checksum: text("checksum"),
    contentType: text("content_type").notNull(),
    ...timestamps(),
    id: uuid("id").primaryKey().default(uuidv7),
    key: text("key").notNull(),
    /** Original client-supplied filename, echoed back on download. */
    name: text("name").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Null until confirmed; then the bucket's size, not the client's claim. */
    size: bigint("size", { mode: "number" }),
    status: text("status", { enum: fileStatuses }).notNull().default("pending"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    check("file_status_chk", oneOf(table.status, fileStatuses)),
    unique("file_organization_id_key").on(table.organizationId, table.id),
    uniqueIndex("file_key_uidx").on(table.key),
    index("file_organizationId_idx").on(table.organizationId),
    index("file_userId_idx").on(table.userId),
    index("file_status_idx").on(table.status),
  ]
);
