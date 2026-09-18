ALTER TABLE "financial_account" ADD COLUMN "card_last_four" text;--> statement-breakpoint
ALTER TABLE "financial_account" ADD COLUMN "card_network" text;--> statement-breakpoint
ALTER TABLE "financial_account" ADD COLUMN "credit_limit" numeric(30,6);--> statement-breakpoint
ALTER TABLE "financial_account" ADD COLUMN "payment_due_day" smallint;--> statement-breakpoint
ALTER TABLE "financial_account" ADD COLUMN "statement_closing_day" smallint;