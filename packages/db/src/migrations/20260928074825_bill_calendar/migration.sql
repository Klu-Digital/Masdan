CREATE TABLE "bill_calendar_feed" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"last_used_at" timestamp,
	"organization_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_payment" (
	"account_id" uuid,
	"confirmed_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"schedule_id" uuid,
	"transaction_id" uuid,
	CONSTRAINT "bill_payment_source_chk" CHECK (("kind" = 'recurring') = ("schedule_id" IS NOT NULL)
        AND ("kind" = 'card') = ("account_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_calendar_feed_token_uidx" ON "bill_calendar_feed" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_calendar_feed_user_organization_uidx" ON "bill_calendar_feed" ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "bill_calendar_feed_organization_idx" ON "bill_calendar_feed" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_schedule_due_uidx" ON "bill_payment" ("schedule_id","due_date") WHERE "schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_account_due_uidx" ON "bill_payment" ("account_id","due_date") WHERE "account_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_transaction_uidx" ON "bill_payment" ("transaction_id") WHERE "transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bill_payment_organization_due_idx" ON "bill_payment" ("organization_id","due_date");--> statement-breakpoint
ALTER TABLE "bill_calendar_feed" ADD CONSTRAINT "bill_calendar_feed_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_calendar_feed" ADD CONSTRAINT "bill_calendar_feed_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_confirmed_by_user_id_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_schedule_id_recurring_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recurring_schedule"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_transaction_id_financial_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE CASCADE;