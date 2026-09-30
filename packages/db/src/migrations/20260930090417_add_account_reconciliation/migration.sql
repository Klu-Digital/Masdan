ALTER TABLE "financial_account_balance_snapshot" ADD COLUMN "adjustment" numeric(30,6);--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "adjustment_direction" text;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "reconciliation_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "balance_snapshot_organization_account_id_key" UNIQUE("organization_id","account_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_reconciliation_snapshot_uidx" ON "financial_transaction" ("reconciliation_snapshot_id");--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "transaction_reconciliation_snapshot_fkey" FOREIGN KEY ("organization_id","account_id","reconciliation_snapshot_id") REFERENCES "financial_account_balance_snapshot"("organization_id","account_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "balance_snapshot_reconciliation_chk" CHECK (("source" = 'reconciliation') = ("adjustment" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" DROP CONSTRAINT "financial_account_balance_snapshot_source_chk", ADD CONSTRAINT "financial_account_balance_snapshot_source_chk" CHECK ("source" IN ('manual', 'import', 'reconciliation'));--> statement-breakpoint
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_category_or_transfer_chk", ADD CONSTRAINT "financial_transaction_category_or_transfer_chk" CHECK ((
        ("reconciliation_snapshot_id" IS NULL AND "adjustment_direction" IS NULL AND (
          ("category_id" IS NOT NULL AND "transfer_id" IS NULL AND "transfer_side" IS NULL)
          OR
          ("category_id" IS NULL AND "transfer_id" IS NOT NULL AND "transfer_side" IS NOT NULL)
        ))
        OR
        ("reconciliation_snapshot_id" IS NOT NULL AND "adjustment_direction" IS NOT NULL
          AND "adjustment_direction" IN ('increase', 'decrease')
          AND "category_id" IS NULL AND "transfer_id" IS NULL AND "transfer_side" IS NULL
          AND "recurring_schedule_id" IS NULL AND "recurring_occurrence_date" IS NULL
          AND "import_fingerprint" IS NULL AND "rule_application" IS NULL AND "suggestion_application" IS NULL)
      ));