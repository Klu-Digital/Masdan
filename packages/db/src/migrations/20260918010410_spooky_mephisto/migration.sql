CREATE TABLE "category" (
	"archived_at" timestamp,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"icon" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "category_organization_archived_idx" ON "category" ("organization_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "category_organization_name_uidx" ON "category" ("organization_id",lower("name"));--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;