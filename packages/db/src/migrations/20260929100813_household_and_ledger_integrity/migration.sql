-- Hand-edited (ADR 0002): drizzle-kit adds foreign keys that validate while they are added.
ALTER TABLE "bill_payment" DROP CONSTRAINT "bill_payment_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "bill_payment" DROP CONSTRAINT "bill_payment_schedule_id_recurring_schedule_id_fkey";
--> statement-breakpoint
ALTER TABLE "bill_payment" DROP CONSTRAINT "bill_payment_transaction_id_financial_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "category_budget" DROP CONSTRAINT "category_budget_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" DROP CONSTRAINT "chat_inbound_message_XVLvaTD9BH34_fkey";
--> statement-breakpoint
ALTER TABLE "credit_card_reminder" DROP CONSTRAINT "credit_card_reminder_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_card_reminder" DROP CONSTRAINT "credit_card_reminder_statement_id_credit_card_statement_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_card_statement" DROP CONSTRAINT "credit_card_statement_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" DROP CONSTRAINT "financial_account_balance_snapshot_So432hpv04KX_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_owner" DROP CONSTRAINT "financial_account_owner_vLgDrwpOJ0pn_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_owner" DROP CONSTRAINT "financial_account_owner_member_id_member_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_transfer_id_financial_transfer_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" DROP CONSTRAINT "financial_transaction_attachment_file_id_file_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" DROP CONSTRAINT "financial_transaction_attachment_dLPrxbcV4UfM_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" DROP CONSTRAINT "financial_transaction_split_category_id_category_id_fkey";
--> statement-breakpoint
-- Postgres truncated this name to 63 characters when the split migration created it.
ALTER TABLE "financial_transaction_split" DROP CONSTRAINT "financial_transaction_split_transaction_id_financial_transactio";
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" DROP CONSTRAINT "financial_transaction_tag_tag_id_tag_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" DROP CONSTRAINT "financial_transaction_tag_K4HFjtyuAbzP_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transfer" DROP CONSTRAINT "financial_transfer_G50neSxrsENW_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transfer" DROP CONSTRAINT "financial_transfer_source_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule" DROP CONSTRAINT "recurring_schedule_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule" DROP CONSTRAINT "recurring_schedule_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" DROP CONSTRAINT "recurring_schedule_tag_schedule_id_recurring_schedule_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" DROP CONSTRAINT "recurring_schedule_tag_tag_id_tag_id_fkey";
--> statement-breakpoint
ALTER TABLE "savings_goal" DROP CONSTRAINT "savings_goal_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" DROP CONSTRAINT "transaction_import_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" DROP CONSTRAINT "transaction_import_default_expense_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" DROP CONSTRAINT "transaction_import_default_income_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" DROP CONSTRAINT "transaction_import_source_file_id_file_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import_row" DROP CONSTRAINT "transaction_import_row_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import_row" DROP CONSTRAINT "transaction_import_row_import_id_transaction_import_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import_row" DROP CONSTRAINT "transaction_import_row_BBLIpy3RFGrl_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule" DROP CONSTRAINT "transaction_rule_match_account_id_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule" DROP CONSTRAINT "transaction_rule_set_category_id_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" DROP CONSTRAINT "transaction_rule_tag_rule_id_transaction_rule_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" DROP CONSTRAINT "transaction_rule_tag_tag_id_tag_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" DROP CONSTRAINT "financial_transaction_recurring_schedule_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD COLUMN "organization_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "credit_card_statement" ADD CONSTRAINT "credit_card_statement_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_organization_id_key" UNIQUE("organization_id","id");
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_schedule_id_fkey" FOREIGN KEY ("organization_id","schedule_id") REFERENCES "recurring_schedule"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE SET NULL NOT VALID;
--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_statement_id_fkey" FOREIGN KEY ("organization_id","statement_id") REFERENCES "credit_card_statement"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "credit_card_statement" ADD CONSTRAINT "credit_card_statement_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "financial_account_balance_snapshot_zGLPH3UWepV5_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "financial_account_balance_snapshot_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_financial_account_id_fkey" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_member_id_fkey" FOREIGN KEY ("organization_id","member_id") REFERENCES "member"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_transfer_id_fkey" FOREIGN KEY ("organization_id","transfer_id") REFERENCES "financial_transfer"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_ZiOJz7zZRNKY_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_file_id_fkey" FOREIGN KEY ("organization_id","file_id") REFERENCES "file"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_KlNOG6P6nad5_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_tag_id_fkey" FOREIGN KEY ("organization_id","tag_id") REFERENCES "tag"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_source_account_id_fkey" FOREIGN KEY ("organization_id","source_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_destination_account_id_fkey" FOREIGN KEY ("organization_id","destination_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_schedule_id_fkey" FOREIGN KEY ("organization_id","schedule_id") REFERENCES "recurring_schedule"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_tag_id_fkey" FOREIGN KEY ("organization_id","tag_id") REFERENCES "tag"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_default_expense_category_id_fkey" FOREIGN KEY ("organization_id","default_expense_category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_default_income_category_id_fkey" FOREIGN KEY ("organization_id","default_income_category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_source_file_id_fkey" FOREIGN KEY ("organization_id","source_file_id") REFERENCES "file"("organization_id","id") ON DELETE SET NULL ("source_file_id") NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_import_id_fkey" FOREIGN KEY ("organization_id","import_id") REFERENCES "transaction_import"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE SET NULL ("transaction_id") NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_match_account_id_fkey" FOREIGN KEY ("organization_id","match_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_set_category_id_fkey" FOREIGN KEY ("organization_id","set_category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_rule_id_fkey" FOREIGN KEY ("organization_id","rule_id") REFERENCES "transaction_rule"("organization_id","id") ON DELETE CASCADE NOT VALID;
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_tag_id_fkey" FOREIGN KEY ("organization_id","tag_id") REFERENCES "tag"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_recurring_schedule_id_fkey" FOREIGN KEY ("organization_id","recurring_schedule_id") REFERENCES "recurring_schedule"("organization_id","id") ON DELETE RESTRICT NOT VALID;
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_household_chk" CHECK (("organization_id" IS NULL) = ("transaction_id" IS NULL)) NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_positive_amount_chk" CHECK ("amount" > 0) NOT VALID;
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_positive_amount_chk" CHECK ("amount" > 0) NOT VALID;
--> statement-breakpoint
-- Separate statements so the scans run under a lock that lets writes through.
ALTER TABLE "bill_payment" VALIDATE CONSTRAINT "bill_payment_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "bill_payment" VALIDATE CONSTRAINT "bill_payment_schedule_id_fkey";
--> statement-breakpoint
ALTER TABLE "bill_payment" VALIDATE CONSTRAINT "bill_payment_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "category_budget" VALIDATE CONSTRAINT "category_budget_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" VALIDATE CONSTRAINT "chat_inbound_message_organization_id_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" VALIDATE CONSTRAINT "chat_inbound_message_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_card_reminder" VALIDATE CONSTRAINT "credit_card_reminder_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_card_reminder" VALIDATE CONSTRAINT "credit_card_reminder_statement_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_card_statement" VALIDATE CONSTRAINT "credit_card_statement_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" VALIDATE CONSTRAINT "financial_account_balance_snapshot_zGLPH3UWepV5_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" VALIDATE CONSTRAINT "financial_account_balance_snapshot_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_owner" VALIDATE CONSTRAINT "financial_account_owner_organization_id_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_owner" VALIDATE CONSTRAINT "financial_account_owner_financial_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_account_owner" VALIDATE CONSTRAINT "financial_account_owner_member_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" VALIDATE CONSTRAINT "financial_transaction_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" VALIDATE CONSTRAINT "financial_transaction_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" VALIDATE CONSTRAINT "financial_transaction_transfer_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" VALIDATE CONSTRAINT "financial_transaction_attachment_ZiOJz7zZRNKY_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" VALIDATE CONSTRAINT "financial_transaction_attachment_file_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" VALIDATE CONSTRAINT "financial_transaction_attachment_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" VALIDATE CONSTRAINT "financial_transaction_split_KlNOG6P6nad5_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" VALIDATE CONSTRAINT "financial_transaction_split_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" VALIDATE CONSTRAINT "financial_transaction_split_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" VALIDATE CONSTRAINT "financial_transaction_tag_organization_id_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" VALIDATE CONSTRAINT "financial_transaction_tag_tag_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" VALIDATE CONSTRAINT "financial_transaction_tag_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transfer" VALIDATE CONSTRAINT "financial_transfer_source_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transfer" VALIDATE CONSTRAINT "financial_transfer_destination_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule" VALIDATE CONSTRAINT "recurring_schedule_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule" VALIDATE CONSTRAINT "recurring_schedule_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" VALIDATE CONSTRAINT "recurring_schedule_tag_organization_id_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" VALIDATE CONSTRAINT "recurring_schedule_tag_schedule_id_fkey";
--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" VALIDATE CONSTRAINT "recurring_schedule_tag_tag_id_fkey";
--> statement-breakpoint
ALTER TABLE "savings_goal" VALIDATE CONSTRAINT "savings_goal_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" VALIDATE CONSTRAINT "transaction_import_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" VALIDATE CONSTRAINT "transaction_import_default_expense_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" VALIDATE CONSTRAINT "transaction_import_default_income_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import" VALIDATE CONSTRAINT "transaction_import_source_file_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import_row" VALIDATE CONSTRAINT "transaction_import_row_import_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import_row" VALIDATE CONSTRAINT "transaction_import_row_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_import_row" VALIDATE CONSTRAINT "transaction_import_row_transaction_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule" VALIDATE CONSTRAINT "transaction_rule_match_account_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule" VALIDATE CONSTRAINT "transaction_rule_set_category_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" VALIDATE CONSTRAINT "transaction_rule_tag_organization_id_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" VALIDATE CONSTRAINT "transaction_rule_tag_rule_id_fkey";
--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" VALIDATE CONSTRAINT "transaction_rule_tag_tag_id_fkey";
--> statement-breakpoint
ALTER TABLE "financial_transaction" VALIDATE CONSTRAINT "financial_transaction_recurring_schedule_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_inbound_message" VALIDATE CONSTRAINT "chat_inbound_message_household_chk";
--> statement-breakpoint
ALTER TABLE "financial_transaction" VALIDATE CONSTRAINT "financial_transaction_positive_amount_chk";
--> statement-breakpoint
ALTER TABLE "financial_transaction_split" VALIDATE CONSTRAINT "financial_transaction_split_positive_amount_chk";
