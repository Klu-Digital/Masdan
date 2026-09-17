import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: "../../apps/server/.env",
});

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  dialect: "postgresql",
  out: "./src/migrations",
  schema: "./src/schema/index.ts",
  // Stated rather than left to drizzle-kit's default: `db:push` drops whatever
  // is not in the schema, and pg-boss owns a schema of its own that it must not
  // touch.
  schemaFilter: ["public"],
});
