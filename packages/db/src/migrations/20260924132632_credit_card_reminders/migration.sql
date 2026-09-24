CREATE TABLE "credit_card_reminder" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp,
	"dismissed_by_user_id" uuid,
	"event_date" date NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"payments_after" date,
	"resolution" text,
	"resolved_at" timestamp,
	"statement_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_card_reminder_resolution_chk" CHECK (("status" = 'resolved') = ("resolution" IS NOT NULL)),
	CONSTRAINT "credit_card_reminder_payment_fields_chk" CHECK (("kind" = 'payment') = ("payments_after" IS NOT NULL)
        AND ("kind" = 'payment' OR "statement_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_reminder_account_kind_date_uidx" ON "credit_card_reminder" ("account_id","kind","event_date");--> statement-breakpoint
CREATE INDEX "credit_card_reminder_organization_status_idx" ON "credit_card_reminder" ("organization_id","status","event_date");--> statement-breakpoint
CREATE INDEX "credit_card_reminder_statement_idx" ON "credit_card_reminder" ("statement_id");--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_dismissed_by_user_id_user_id_fkey" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_statement_id_credit_card_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "credit_card_statement"("id") ON DELETE CASCADE;