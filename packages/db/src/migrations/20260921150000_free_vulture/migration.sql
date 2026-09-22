CREATE TYPE "transfer_side" AS ENUM('source', 'destination');--> statement-breakpoint
CREATE TABLE "financial_transfer" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"destination_amount" numeric(30,6) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"notes" text,
	"organization_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"source_amount" numeric(30,6) NOT NULL,
	"transaction_date" date NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "financial_transfer_distinct_accounts_chk" CHECK ("source_account_id" <> "destination_account_id"),
	CONSTRAINT "financial_transfer_positive_amounts_chk" CHECK ("source_amount" > 0 AND "destination_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "transfer_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "transfer_side" "transfer_side";--> statement-breakpoint
ALTER TABLE "financial_transaction" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "financial_transaction_transfer_idx" ON "financial_transaction" ("transfer_id");--> statement-breakpoint
CREATE INDEX "financial_transfer_organization_date_idx" ON "financial_transfer" ("organization_id","transaction_date","id");--> statement-breakpoint
CREATE INDEX "financial_transfer_source_account_idx" ON "financial_transfer" ("source_account_id","transaction_date","id");--> statement-breakpoint
CREATE INDEX "financial_transfer_destination_account_idx" ON "financial_transfer" ("destination_account_id","transaction_date","id");--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_transfer_id_financial_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "financial_transfer"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_G50neSxrsENW_fkey" FOREIGN KEY ("destination_account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_source_account_id_financial_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_category_or_transfer_chk" CHECK ((
        ("category_id" IS NOT NULL AND "transfer_id" IS NULL AND "transfer_side" IS NULL)
        OR
        ("category_id" IS NULL AND "transfer_id" IS NOT NULL AND "transfer_side" IS NOT NULL)
      ));