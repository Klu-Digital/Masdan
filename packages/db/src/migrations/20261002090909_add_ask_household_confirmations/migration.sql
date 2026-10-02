CREATE TABLE "ask_turn" (
	"actions" jsonb,
	"applied_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"observations" jsonb NOT NULL,
	"organization_id" uuid NOT NULL,
	"outcomes" jsonb,
	"previous_id" uuid,
	"question" text NOT NULL,
	"response" jsonb NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "ask_turn_organization_id_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE INDEX "ask_turn_user_household_idx" ON "ask_turn" ("user_id","organization_id");--> statement-breakpoint
ALTER TABLE "ask_turn" ADD CONSTRAINT "ask_turn_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ask_turn" ADD CONSTRAINT "ask_turn_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ask_turn" ADD CONSTRAINT "ask_turn_previous_id_fkey" FOREIGN KEY ("organization_id","previous_id") REFERENCES "ask_turn"("organization_id","id") ON DELETE RESTRICT;