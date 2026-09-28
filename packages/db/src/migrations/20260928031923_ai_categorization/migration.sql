ALTER TABLE "financial_transaction" ADD COLUMN "suggestion_application" jsonb;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD COLUMN "suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD COLUMN "suggestion_application" jsonb;