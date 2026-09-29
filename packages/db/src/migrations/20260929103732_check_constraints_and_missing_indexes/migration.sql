CREATE INDEX "chat_link_organization_idx" ON "chat_link" ("organization_id");--> statement-breakpoint
CREATE INDEX "transaction_import_row_organization_idx" ON "transaction_import_row" ("organization_id");--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_kind_chk" CHECK ("kind" IN ('recurring', 'card'));--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_type_chk" CHECK ("type" IN ('expense', 'income'));--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_channel_chk" CHECK ("channel" IN ('telegram'));--> statement-breakpoint
ALTER TABLE "chat_link" ADD CONSTRAINT "chat_link_channel_chk" CHECK ("channel" IN ('telegram'));--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_kind_chk" CHECK ("kind" IN ('statement', 'payment'));--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_status_chk" CHECK ("status" IN ('active', 'dismissed', 'resolved'));--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_resolution_value_chk" CHECK ("resolution" IN ('recorded', 'paid', 'superseded', 'expired', 'account_archived'));--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_status_chk" CHECK ("status" IN ('pending', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_class_chk" CHECK ("account_class" IN ('asset', 'liability'));--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_type_chk" CHECK ("account_type" IN ('cash', 'bank', 'e_wallet', 'investment', 'property', 'vehicle', 'receivable', 'other_asset', 'credit_card', 'personal_loan', 'mortgage', 'auto_loan', 'payable', 'other_liability'));--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_class_type_chk" CHECK (("account_class" = 'asset') = ("account_type" IN ('cash', 'bank', 'e_wallet', 'investment', 'property', 'vehicle', 'receivable', 'other_asset')));--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_liquidity_chk" CHECK ("liquidity" IS NULL OR "liquidity" IN ('liquid', 'semi_liquid', 'illiquid'));--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "financial_account_balance_snapshot_source_chk" CHECK ("source" IN ('manual', 'import'));--> statement-breakpoint
ALTER TABLE "post_migration" ADD CONSTRAINT "post_migration_status_chk" CHECK ("status" IN ('running', 'success', 'failed'));--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_frequency_chk" CHECK ("frequency" IN ('daily', 'weekly', 'monthly'));--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_status_chk" CHECK ("status" IN ('active', 'paused', 'stopped'));--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_status_chk" CHECK ("status" IN ('validating', 'ready', 'committing', 'completed', 'failed', 'discarded'));--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_failed_status_chk" CHECK ("failed_status" IN ('validating', 'committing'));--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_opening_balance_mode_chk" CHECK ("opening_balance_mode" IN ('reject', 'rebase', 'include'));--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_status_chk" CHECK ("status" IN ('valid', 'invalid', 'duplicate', 'imported'));--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_type_chk" CHECK ("type" IN ('income', 'expense'));--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_match_text_operator_chk" CHECK ("match_text_operator" IN ('contains', 'equals', 'startsWith'));--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_match_type_chk" CHECK ("match_type" IN ('income', 'expense'));