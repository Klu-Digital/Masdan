CREATE TYPE "paid_status" AS ENUM('paid', 'unpaid');--> statement-breakpoint
CREATE TABLE "financial_transaction" (
	"account_id" uuid NOT NULL,
	"amount" numeric(30,6) NOT NULL,
	"archived_at" timestamp,
	"category_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"currency_code" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"notes" text,
	"organization_id" uuid NOT NULL,
	"paid_status" "paid_status" DEFAULT 'paid'::"paid_status" NOT NULL,
	"transaction_date" date NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_transaction_tag" (
	"tag_id" uuid,
	"transaction_id" uuid,
	CONSTRAINT "financial_transaction_tag_pkey" PRIMARY KEY("transaction_id","tag_id")
);
--> statement-breakpoint
CREATE INDEX "financial_transaction_organization_date_idx" ON "financial_transaction" ("organization_id","archived_at","transaction_date");--> statement-breakpoint
CREATE INDEX "financial_transaction_account_date_idx" ON "financial_transaction" ("account_id","archived_at","transaction_date");--> statement-breakpoint
CREATE INDEX "financial_transaction_category_idx" ON "financial_transaction" ("category_id");--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_tag_id_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_K4HFjtyuAbzP_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE CASCADE;