-- Drizzle cannot express these, so they are applied after app_init.
-- SET NULL on the child column only: a plain SET NULL would also null organization_id.
ALTER TABLE "transaction_import" DROP CONSTRAINT "transaction_import_source_file_id_fkey";--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_source_file_id_fkey" FOREIGN KEY ("organization_id","source_file_id") REFERENCES "file"("organization_id","id") ON DELETE SET NULL ("source_file_id");--> statement-breakpoint
ALTER TABLE "transaction_import_row" DROP CONSTRAINT "transaction_import_row_transaction_id_fkey";--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE SET NULL ("transaction_id");--> statement-breakpoint
-- Deferred so a reorder can rewrite positions one row at a time.
ALTER TABLE "transaction_rule" DROP CONSTRAINT "transaction_rule_organization_position_key";--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_organization_position_key" UNIQUE("organization_id","position") DEFERRABLE INITIALLY DEFERRED;
