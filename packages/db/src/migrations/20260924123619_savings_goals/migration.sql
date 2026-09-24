CREATE TABLE "savings_goal" (
	"account_id" uuid NOT NULL,
	"archived_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"target_amount" numeric(30,6) NOT NULL,
	"target_date" date,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goal_positive_target_chk" CHECK ("target_amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "savings_goal_organization_idx" ON "savings_goal" ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "savings_goal_account_idx" ON "savings_goal" ("account_id");--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id");--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;