import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  uuid,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { timestamps, timestamptz } from "./columns";
import { currency } from "./finance";

/** Postgres 18+ native time-ordered UUID, used as the default for every id column. */
const uuidv7 = sql`uuidv7()`;

export const user = pgTable("user", {
  banExpires: timestamptz("ban_expires"),
  banReason: text("ban_reason"),
  banned: boolean("banned").default(false),
  ...timestamps(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  id: uuid("id").primaryKey().default(uuidv7),
  image: text("image"),
  name: text("name").notNull(),
  role: text("role"),
});

export const session = pgTable(
  "session",
  {
    activeOrganizationId: uuid("active_organization_id"),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    id: uuid("id").primaryKey().default(uuidv7),
    impersonatedBy: uuid("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: timestamptz("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    accountId: text("account_id").notNull(),
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    id: uuid("id").primaryKey().default(uuidv7),
    idToken: text("id_token"),
    issuer: text("issuer").notNull(),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    updatedAt: timestamptz("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("account_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId
    ),
    index("account_userId_idx").on(table.userId),
  ]
);

export const verification = pgTable(
  "verification",
  {
    ...timestamps(),
    expiresAt: timestamptz("expires_at").notNull(),
    id: uuid("id").primaryKey().default(uuidv7),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const organization = pgTable(
  "organization",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    /** `restrict`: a currency a household still points at is not deletable. */
    defaultCurrency: text("default_currency")
      .default("PHP")
      .notNull()
      .references(() => currency.code, { onDelete: "restrict" }),
    id: uuid("id").primaryKey().default(uuidv7),
    logo: text("logo"),
    metadata: text("metadata"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // IANA zone, not a table: the runtime's list can't desync from tzdb.
    timezone: text("timezone").default("Asia/Manila").notNull(),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)]
);

export const member = pgTable(
  "member",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    id: uuid("id").primaryKey().default(uuidv7),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("member_organization_id_key").on(table.organizationId, table.id),
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ]
);

export const invitation = pgTable(
  "invitation",
  {
    createdAt: timestamptz("created_at").defaultNow().notNull(),
    email: text("email").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    id: uuid("id").primaryKey().default(uuidv7),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role"),
    status: text("status").default("pending").notNull(),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ]
);
