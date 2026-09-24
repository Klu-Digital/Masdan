CREATE TABLE "transaction_import" (
	"account_id" uuid NOT NULL,
	"checksum" text,
	"committed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"default_expense_category_id" uuid NOT NULL,
	"default_income_category_id" uuid NOT NULL,
	"duplicate_rows" integer DEFAULT 0 NOT NULL,
	"error" text,
	"failed_status" text,
	"file_name" text NOT NULL,
	"headers" jsonb DEFAULT '[]' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"mapping" jsonb NOT NULL,
	"opening_balance_mode" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_file_id" uuid,
	"status" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"validated_at" timestamp,
	"valid_rows" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_import_row" (
	"amount" numeric(30,6),
	"category_id" uuid,
	"description" text,
	"errors" jsonb DEFAULT '[]' NOT NULL,
	"fingerprint" text,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"import_id" uuid NOT NULL,
	"notes" text,
	"organization_id" uuid NOT NULL,
	"raw" jsonb NOT NULL,
	"row_number" integer NOT NULL,
	"status" text NOT NULL,
	"transaction_date" date,
	"transaction_id" uuid,
	"type" text
);
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "import_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_account_import_fingerprint_uidx" ON "financial_transaction" ("account_id","import_fingerprint") WHERE "import_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transaction_import_organization_idx" ON "transaction_import" ("organization_id","id");--> statement-breakpoint
CREATE INDEX "transaction_import_checksum_idx" ON "transaction_import" ("organization_id","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_import_row_import_row_uidx" ON "transaction_import_row" ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "transaction_import_row_import_status_idx" ON "transaction_import_row" ("import_id","status","row_number");--> statement-breakpoint
CREATE INDEX "transaction_import_row_transaction_idx" ON "transaction_import_row" ("transaction_id");--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_default_expense_category_id_category_id_fkey" FOREIGN KEY ("default_expense_category_id") REFERENCES "category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_default_income_category_id_category_id_fkey" FOREIGN KEY ("default_income_category_id") REFERENCES "category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_source_file_id_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "file"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_import_id_transaction_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "transaction_import"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_BBLIpy3RFGrl_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE SET NULL;