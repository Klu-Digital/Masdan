CREATE TABLE "financial_transaction_attachment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"file_id" uuid,
	"transaction_id" uuid,
	CONSTRAINT "financial_transaction_attachment_pkey" PRIMARY KEY("transaction_id","file_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_attachment_file_uidx" ON "financial_transaction_attachment" ("file_id");--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_file_id_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_dLPrxbcV4UfM_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE CASCADE;