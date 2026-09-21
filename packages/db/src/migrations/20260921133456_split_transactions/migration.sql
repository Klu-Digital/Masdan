CREATE TABLE "financial_transaction_split" (
	"amount" numeric(30,6) NOT NULL,
	"category_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"sort_order" integer NOT NULL,
	"transaction_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_split_transaction_order_uidx" ON "financial_transaction_split" ("transaction_id","sort_order");--> statement-breakpoint
CREATE INDEX "financial_transaction_split_category_idx" ON "financial_transaction_split" ("category_id");--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_transaction_id_financial_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE CASCADE;
