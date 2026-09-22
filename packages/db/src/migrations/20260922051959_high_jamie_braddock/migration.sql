CREATE TABLE "credit_card_statement" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"due_date" date,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"minimum_amount_due" numeric(30,6),
	"organization_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"period_start" date NOT NULL,
	"statement_balance" numeric(30,6) NOT NULL,
	"statement_date" date NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_card_statement_period_chk" CHECK ("period_start" <= "period_end"),
	CONSTRAINT "credit_card_statement_minimum_due_chk" CHECK ("minimum_amount_due" IS NULL OR "minimum_amount_due" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_statement_account_date_uidx" ON "credit_card_statement" ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX "credit_card_statement_organization_date_idx" ON "credit_card_statement" ("organization_id","statement_date");--> statement-breakpoint
ALTER TABLE "credit_card_statement" ADD CONSTRAINT "credit_card_statement_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_statement" ADD CONSTRAINT "credit_card_statement_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;