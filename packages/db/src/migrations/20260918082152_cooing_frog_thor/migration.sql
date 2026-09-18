CREATE TABLE "tag" (
	"archived_at" timestamp,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tag_organization_archived_idx" ON "tag" ("organization_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_organization_name_uidx" ON "tag" ("organization_id",lower("name"));--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;