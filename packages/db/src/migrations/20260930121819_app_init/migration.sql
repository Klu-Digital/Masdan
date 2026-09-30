CREATE TYPE "paid_status" AS ENUM('paid', 'unpaid');--> statement-breakpoint
CREATE TYPE "transfer_side" AS ENUM('source', 'destination');--> statement-breakpoint
CREATE TABLE "account" (
	"access_token" text,
	"access_token_expires_at" timestamp with time zone,
	"account_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"id_token" text,
	"issuer" text NOT NULL,
	"password" text,
	"provider_id" text NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"updated_at" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_token_cap" (
	"feature" text PRIMARY KEY,
	"max_tokens" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"day" date,
	"organization_id" uuid,
	"requests" integer DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_pkey" PRIMARY KEY("organization_id","day")
);
--> statement-breakpoint
CREATE TABLE "bill_calendar_feed" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"last_used_at" timestamp with time zone,
	"organization_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_payment" (
	"account_id" uuid,
	"confirmed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"schedule_id" uuid,
	"transaction_id" uuid,
	CONSTRAINT "bill_payment_kind_chk" CHECK ("kind" IN ('recurring', 'card')),
	CONSTRAINT "bill_payment_source_chk" CHECK (("kind" = 'recurring') = ("schedule_id" IS NOT NULL)
        AND ("kind" = 'card') = ("account_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "category" (
	"archived_at" timestamp with time zone,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"icon" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "category_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "category_type_chk" CHECK ("type" IN ('expense', 'income'))
);
--> statement-breakpoint
CREATE TABLE "category_budget" (
	"amount" numeric(30,6) NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"month" date NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "category_budget_positive_amount_chk" CHECK ("amount" > 0),
	CONSTRAINT "category_budget_month_start_chk" CHECK (EXTRACT(DAY FROM "month") = 1)
);
--> statement-breakpoint
CREATE TABLE "chat_inbound_message" (
	"channel" text,
	"message_id" text,
	"organization_id" uuid,
	"processed_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transaction_id" uuid,
	CONSTRAINT "chat_inbound_message_pkey" PRIMARY KEY("channel","message_id"),
	CONSTRAINT "chat_inbound_message_channel_chk" CHECK ("channel" IN ('telegram')),
	CONSTRAINT "chat_inbound_message_household_chk" CHECK (("organization_id" IS NULL) = ("transaction_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "chat_link" (
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_name" text,
	"external_user_id" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "chat_link_channel_chk" CHECK ("channel" IN ('telegram'))
);
--> statement-breakpoint
CREATE TABLE "chat_link_code" (
	"code_hash" text NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_card_reminder" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismissed_by_user_id" uuid,
	"event_date" date NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"payments_after" date,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"statement_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "credit_card_reminder_kind_chk" CHECK ("kind" IN ('statement', 'payment')),
	CONSTRAINT "credit_card_reminder_status_chk" CHECK ("status" IN ('active', 'dismissed', 'resolved')),
	CONSTRAINT "credit_card_reminder_resolution_value_chk" CHECK ("resolution" IN ('recorded', 'paid', 'superseded', 'expired', 'account_archived')),
	CONSTRAINT "credit_card_reminder_resolution_chk" CHECK (("status" = 'resolved') = ("resolution" IS NOT NULL)),
	CONSTRAINT "credit_card_reminder_payment_fields_chk" CHECK (("kind" = 'payment') = ("payments_after" IS NOT NULL)
        AND ("kind" = 'payment' OR "statement_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "credit_card_statement" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"minimum_amount_due" numeric(30,6),
	"organization_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"period_start" date NOT NULL,
	"statement_balance" numeric(30,6) NOT NULL,
	"statement_date" date NOT NULL,
	CONSTRAINT "credit_card_statement_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "credit_card_statement_period_chk" CHECK ("period_start" <= "period_end"),
	CONSTRAINT "credit_card_statement_minimum_due_chk" CHECK ("minimum_amount_due" IS NULL OR "minimum_amount_due" >= 0)
);
--> statement-breakpoint
CREATE TABLE "currency" (
	"code" text PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"minor_units" smallint NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"symbol_native" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rate" (
	"base_currency" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(30,12) NOT NULL,
	"rate_date" date NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "exchange_rate_positive_chk" CHECK ("rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL UNIQUE,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "file" (
	"bucket" text NOT NULL,
	"checksum" text,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"key" text NOT NULL,
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"size" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "file_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "file_status_chk" CHECK ("status" IN ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "financial_account" (
	"account_class" text NOT NULL,
	"account_type" text NOT NULL,
	"archived_at" timestamp with time zone,
	"card_last_four" text,
	"card_network" text,
	"card_product_key" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credit_limit" numeric(30,6),
	"currency_code" text NOT NULL,
	"icon" text,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"institution" text,
	"institution_id" uuid,
	"liquidity" text,
	"name" text NOT NULL,
	"notes" text,
	"opening_balance" numeric(30,6) DEFAULT '0' NOT NULL,
	"opening_balance_date" date DEFAULT now() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_due_day" smallint,
	"statement_closing_day" smallint,
	CONSTRAINT "financial_account_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "financial_account_class_chk" CHECK ("account_class" IN ('asset', 'liability')),
	CONSTRAINT "financial_account_type_chk" CHECK ("account_type" IN ('cash', 'bank', 'e_wallet', 'investment', 'property', 'vehicle', 'receivable', 'other_asset', 'credit_card', 'personal_loan', 'mortgage', 'auto_loan', 'payable', 'other_liability')),
	CONSTRAINT "financial_account_class_type_chk" CHECK (("account_class" = 'asset') = ("account_type" IN ('cash', 'bank', 'e_wallet', 'investment', 'property', 'vehicle', 'receivable', 'other_asset'))),
	CONSTRAINT "financial_account_liquidity_chk" CHECK ("liquidity" IS NULL OR "liquidity" IN ('liquid', 'semi_liquid', 'illiquid'))
);
--> statement-breakpoint
CREATE TABLE "financial_account_balance_snapshot" (
	"account_id" uuid NOT NULL,
	"adjustment" numeric(30,6),
	"balance" numeric(30,6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_date" date NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"import_reference" text,
	"notes" text,
	"organization_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "balance_snapshot_organization_account_id_key" UNIQUE("organization_id","account_id","id"),
	CONSTRAINT "financial_account_balance_snapshot_source_chk" CHECK ("source" IN ('manual', 'import', 'reconciliation')),
	CONSTRAINT "balance_snapshot_reconciliation_chk" CHECK (("source" = 'reconciliation') = ("adjustment" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "financial_account_interest" (
	"account_id" uuid NOT NULL,
	"auto_post" boolean DEFAULT true NOT NULL,
	"bonus_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"maturity_date" date,
	"organization_id" uuid NOT NULL,
	"product_id" uuid,
	"start_date" date,
	"term_count" smallint,
	"term_unit" text,
	CONSTRAINT "financial_account_interest_account_key" UNIQUE("organization_id","account_id"),
	CONSTRAINT "financial_account_interest_term_chk" CHECK (("term_count" IS NULL) = ("term_unit" IS NULL) AND ("term_unit" IS NULL OR ("term_unit" IN ('day', 'month') AND "term_count" > 0))),
	CONSTRAINT "financial_account_interest_maturity_chk" CHECK ("maturity_date" IS NULL OR "start_date" IS NULL OR "start_date" < "maturity_date")
);
--> statement-breakpoint
CREATE TABLE "financial_account_interest_rate" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"follows_preset" boolean NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"bonus_annual_rate" numeric(12,6),
	"calculation_basis" text,
	"condition_summary" text,
	"credit_frequency" text,
	"day_count_basis" text,
	"interest_cap_balance" numeric(30,6),
	"minimum_balance" numeric(30,6),
	"tier_mode" text,
	"tiers" jsonb,
	"withholding_tax_rate" numeric(12,6),
	CONSTRAINT "financial_account_interest_rate_version_key" UNIQUE("account_id","effective_from"),
	CONSTRAINT "financial_account_interest_rate_tier_mode_chk" CHECK ("tier_mode" IS NULL OR "tier_mode" IN ('marginal', 'whole_balance')),
	CONSTRAINT "financial_account_interest_rate_calculation_basis_chk" CHECK ("calculation_basis" IS NULL OR "calculation_basis" IN ('eod', 'adb', 'principal')),
	CONSTRAINT "financial_account_interest_rate_day_count_basis_chk" CHECK ("day_count_basis" IS NULL OR "day_count_basis" IN ('actual', '365', '360')),
	CONSTRAINT "financial_account_interest_rate_credit_frequency_chk" CHECK ("credit_frequency" IS NULL OR "credit_frequency" IN ('daily', 'monthly', 'maturity')),
	CONSTRAINT "financial_account_interest_rate_terms_chk" CHECK (CASE WHEN "follows_preset" THEN ("tier_mode" IS NULL AND "tiers" IS NULL AND "calculation_basis" IS NULL AND "day_count_basis" IS NULL AND "credit_frequency" IS NULL AND "withholding_tax_rate" IS NULL) ELSE ("tier_mode" IS NOT NULL AND "tiers" IS NOT NULL AND "calculation_basis" IS NOT NULL AND "day_count_basis" IS NOT NULL AND "credit_frequency" IS NOT NULL AND "withholding_tax_rate" IS NOT NULL) END),
	CONSTRAINT "financial_account_interest_rate_period_chk" CHECK ("effective_to" IS NULL OR "effective_from" <= "effective_to")
);
--> statement-breakpoint
CREATE TABLE "financial_account_owner" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"member_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_institution" (
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"brand_color" text NOT NULL,
	"country_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"institution_type" text NOT NULL,
	"key" text NOT NULL CONSTRAINT "financial_institution_key_key" UNIQUE,
	"logo_key" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"website_url" text,
	CONSTRAINT "financial_institution_type_chk" CHECK ("institution_type" IN ('digital_bank', 'bank', 'savings_bank', 'rural_bank', 'channel'))
);
--> statement-breakpoint
CREATE TABLE "financial_transaction" (
	"account_id" uuid NOT NULL,
	"adjustment_direction" text,
	"amount" numeric(30,6) NOT NULL,
	"archived_at" timestamp with time zone,
	"category_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"import_fingerprint" text,
	"notes" text,
	"organization_id" uuid NOT NULL,
	"paid_status" "paid_status" DEFAULT 'paid'::"paid_status" NOT NULL,
	"reconciliation_snapshot_id" uuid,
	"recurring_occurrence_date" date,
	"recurring_schedule_id" uuid,
	"rule_application" jsonb,
	"suggestion_application" jsonb,
	"transaction_date" date NOT NULL,
	"transfer_id" uuid,
	"transfer_side" "transfer_side",
	CONSTRAINT "financial_transaction_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "financial_transaction_positive_amount_chk" CHECK ("amount" > 0),
	CONSTRAINT "financial_transaction_category_or_transfer_chk" CHECK ((
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
      )),
	CONSTRAINT "financial_transaction_recurring_occurrence_chk" CHECK (("recurring_schedule_id" IS NULL) = ("recurring_occurrence_date" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "financial_transaction_attachment" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_id" uuid,
	"organization_id" uuid NOT NULL,
	"transaction_id" uuid,
	CONSTRAINT "financial_transaction_attachment_pkey" PRIMARY KEY("transaction_id","file_id")
);
--> statement-breakpoint
CREATE TABLE "financial_transaction_split" (
	"amount" numeric(30,6) NOT NULL,
	"category_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"transaction_id" uuid NOT NULL,
	CONSTRAINT "financial_transaction_split_positive_amount_chk" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "financial_transaction_tag" (
	"organization_id" uuid NOT NULL,
	"tag_id" uuid,
	"transaction_id" uuid,
	CONSTRAINT "financial_transaction_tag_pkey" PRIMARY KEY("transaction_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "financial_transfer" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"destination_account_id" uuid NOT NULL,
	"destination_amount" numeric(30,6) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"notes" text,
	"organization_id" uuid NOT NULL,
	"source_account_id" uuid NOT NULL,
	"source_amount" numeric(30,6) NOT NULL,
	"transaction_date" date NOT NULL,
	CONSTRAINT "financial_transfer_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "financial_transfer_distinct_accounts_chk" CHECK ("source_account_id" <> "destination_account_id"),
	CONSTRAINT "financial_transfer_positive_amounts_chk" CHECK ("source_amount" > 0 AND "destination_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "household_exchange_rate" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"from_currency" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"rate" numeric(30,12) NOT NULL,
	"rate_date" date NOT NULL,
	"to_currency" text NOT NULL,
	CONSTRAINT "household_exchange_rate_positive_chk" CHECK ("rate" > 0),
	CONSTRAINT "household_exchange_rate_pair_chk" CHECK ("from_currency" <> "to_currency")
);
--> statement-breakpoint
CREATE TABLE "interest_credit" (
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credit_date" date NOT NULL,
	"gross" numeric(30,6) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"net" numeric(30,6) NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_end" date NOT NULL,
	"period_start" date NOT NULL,
	"tax" numeric(30,6) NOT NULL,
	"transaction_id" uuid,
	CONSTRAINT "interest_credit_account_date_key" UNIQUE("account_id","credit_date"),
	CONSTRAINT "interest_credit_period_chk" CHECK ("period_start" <= "period_end")
);
--> statement-breakpoint
CREATE TABLE "interest_product" (
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"channel_institution_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency_code" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"institution_id" uuid NOT NULL,
	"key" text NOT NULL CONSTRAINT "interest_product_key_key" UNIQUE,
	"name" text NOT NULL,
	"notes" text,
	"product_type" text NOT NULL,
	"source_url" text,
	CONSTRAINT "interest_product_type_chk" CHECK ("product_type" IN ('savings', 'goal_savings', 'time_deposit'))
);
--> statement-breakpoint
CREATE TABLE "interest_rate_schedule" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"product_id" uuid NOT NULL,
	"source_checked_at" date,
	"source_url" text,
	"term_count" smallint,
	"term_unit" text,
	"bonus_annual_rate" numeric(12,6),
	"calculation_basis" text,
	"condition_summary" text,
	"credit_frequency" text,
	"day_count_basis" text,
	"interest_cap_balance" numeric(30,6),
	"minimum_balance" numeric(30,6),
	"tier_mode" text,
	"tiers" jsonb,
	"withholding_tax_rate" numeric(12,6),
	CONSTRAINT "interest_rate_schedule_version_key" UNIQUE NULLS NOT DISTINCT("product_id","term_count","term_unit","effective_from"),
	CONSTRAINT "interest_rate_schedule_tier_mode_chk" CHECK ("tier_mode" IS NULL OR "tier_mode" IN ('marginal', 'whole_balance')),
	CONSTRAINT "interest_rate_schedule_calculation_basis_chk" CHECK ("calculation_basis" IS NULL OR "calculation_basis" IN ('eod', 'adb', 'principal')),
	CONSTRAINT "interest_rate_schedule_day_count_basis_chk" CHECK ("day_count_basis" IS NULL OR "day_count_basis" IN ('actual', '365', '360')),
	CONSTRAINT "interest_rate_schedule_credit_frequency_chk" CHECK ("credit_frequency" IS NULL OR "credit_frequency" IN ('daily', 'monthly', 'maturity')),
	CONSTRAINT "interest_rate_schedule_terms_chk" CHECK (("tier_mode" IS NOT NULL AND "tiers" IS NOT NULL AND "calculation_basis" IS NOT NULL AND "day_count_basis" IS NOT NULL AND "credit_frequency" IS NOT NULL AND "withholding_tax_rate" IS NOT NULL)),
	CONSTRAINT "interest_rate_schedule_term_chk" CHECK (("term_count" IS NULL) = ("term_unit" IS NULL) AND ("term_unit" IS NULL OR ("term_unit" IN ('day', 'month') AND "term_count" > 0))),
	CONSTRAINT "interest_rate_schedule_period_chk" CHECK ("effective_from" IS NULL OR "effective_to" IS NULL OR "effective_from" <= "effective_to")
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"inviter_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "member_organization_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_currency" text DEFAULT 'PHP' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"logo" text,
	"metadata" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Manila' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_migration" (
	"applied_by" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"duration_ms" integer,
	"error" text,
	"finished_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL UNIQUE,
	"started_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "post_migration_status_chk" CHECK ("status" IN ('running', 'success', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "recurring_schedule" (
	"account_id" uuid NOT NULL,
	"amount" numeric(30,6) NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"frequency" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"interval" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"name" text NOT NULL,
	"next_occurrence_date" date,
	"notes" text,
	"organization_id" uuid NOT NULL,
	"paid_status" "paid_status" DEFAULT 'paid'::"paid_status" NOT NULL,
	"paused_at" timestamp with time zone,
	"start_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stopped_at" timestamp with time zone,
	CONSTRAINT "recurring_schedule_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "recurring_schedule_frequency_chk" CHECK ("frequency" IN ('daily', 'weekly', 'monthly')),
	CONSTRAINT "recurring_schedule_status_chk" CHECK ("status" IN ('active', 'paused', 'stopped')),
	CONSTRAINT "recurring_schedule_positive_amount_chk" CHECK ("amount" > 0),
	CONSTRAINT "recurring_schedule_interval_chk" CHECK ("interval" BETWEEN 1 AND 366),
	CONSTRAINT "recurring_schedule_next_occurrence_chk" CHECK (("status" = 'stopped') = ("next_occurrence_date" IS NULL)
        AND ("next_occurrence_date" IS NULL OR "next_occurrence_date" >= "start_date"))
);
--> statement-breakpoint
CREATE TABLE "recurring_schedule_tag" (
	"organization_id" uuid NOT NULL,
	"schedule_id" uuid,
	"tag_id" uuid,
	CONSTRAINT "recurring_schedule_tag_pkey" PRIMARY KEY("schedule_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "savings_goal" (
	"account_id" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"target_amount" numeric(30,6) NOT NULL,
	"target_date" date,
	CONSTRAINT "savings_goal_positive_target_chk" CHECK ("target_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"active_organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"impersonated_by" uuid,
	"ip_address" text,
	"token" text NOT NULL UNIQUE,
	"updated_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"archived_at" timestamp with time zone,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	CONSTRAINT "tag_organization_id_key" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "transaction_import" (
	"account_id" uuid NOT NULL,
	"checksum" text,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
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
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"validated_at" timestamp with time zone,
	CONSTRAINT "transaction_import_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "transaction_import_status_chk" CHECK ("status" IN ('validating', 'ready', 'committing', 'completed', 'failed', 'discarded')),
	CONSTRAINT "transaction_import_failed_status_chk" CHECK ("failed_status" IN ('validating', 'committing')),
	CONSTRAINT "transaction_import_opening_balance_mode_chk" CHECK ("opening_balance_mode" IN ('reject', 'rebase', 'include'))
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
	"rule_application" jsonb,
	"status" text NOT NULL,
	"suggestion" jsonb,
	"suggestion_application" jsonb,
	"transaction_date" date,
	"transaction_id" uuid,
	"type" text,
	CONSTRAINT "transaction_import_row_status_chk" CHECK ("status" IN ('valid', 'invalid', 'duplicate', 'imported')),
	CONSTRAINT "transaction_import_row_type_chk" CHECK ("type" IN ('income', 'expense'))
);
--> statement-breakpoint
CREATE TABLE "transaction_rule" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"match_account_id" uuid,
	"match_amount_max" numeric(30,6),
	"match_amount_min" numeric(30,6),
	"match_text" text,
	"match_text_operator" text,
	"match_type" text,
	"name" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"set_category_id" uuid,
	CONSTRAINT "transaction_rule_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "transaction_rule_organization_position_key" UNIQUE("organization_id","position"),
	CONSTRAINT "transaction_rule_match_text_operator_chk" CHECK ("match_text_operator" IN ('contains', 'equals', 'startsWith')),
	CONSTRAINT "transaction_rule_match_type_chk" CHECK ("match_type" IN ('income', 'expense')),
	CONSTRAINT "transaction_rule_text_operator_chk" CHECK (("match_text" IS NULL) = ("match_text_operator" IS NULL)),
	CONSTRAINT "transaction_rule_has_condition_chk" CHECK (num_nonnulls("match_text", "match_type", "match_account_id", "match_amount_min", "match_amount_max") > 0),
	CONSTRAINT "transaction_rule_amount_range_chk" CHECK (("match_amount_min" IS NULL OR "match_amount_min" > 0)
        AND ("match_amount_max" IS NULL OR "match_amount_max" > 0)
        AND ("match_amount_min" IS NULL OR "match_amount_max" IS NULL OR "match_amount_min" <= "match_amount_max"))
);
--> statement-breakpoint
CREATE TABLE "transaction_rule_tag" (
	"organization_id" uuid NOT NULL,
	"rule_id" uuid,
	"tag_id" uuid,
	CONSTRAINT "transaction_rule_tag_pkey" PRIMARY KEY("rule_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"ban_expires" timestamp with time zone,
	"ban_reason" text,
	"banned" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"image" text,
	"name" text NOT NULL,
	"role" text
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"identifier" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_calendar_feed_token_uidx" ON "bill_calendar_feed" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_calendar_feed_user_organization_uidx" ON "bill_calendar_feed" ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "bill_calendar_feed_organization_idx" ON "bill_calendar_feed" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_schedule_due_uidx" ON "bill_payment" ("schedule_id","due_date") WHERE "schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_account_due_uidx" ON "bill_payment" ("account_id","due_date") WHERE "account_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_transaction_uidx" ON "bill_payment" ("transaction_id") WHERE "transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bill_payment_organization_due_idx" ON "bill_payment" ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "category_organization_archived_idx" ON "category" ("organization_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "category_organization_name_uidx" ON "category" ("organization_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "category_budget_organization_month_category_uidx" ON "category_budget" ("organization_id","month","category_id");--> statement-breakpoint
CREATE INDEX "category_budget_category_idx" ON "category_budget" ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_link_channel_external_user_uidx" ON "chat_link" ("channel","external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_link_channel_user_organization_uidx" ON "chat_link" ("channel","user_id","organization_id");--> statement-breakpoint
CREATE INDEX "chat_link_organization_idx" ON "chat_link" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_link_code_hash_uidx" ON "chat_link_code" ("code_hash");--> statement-breakpoint
CREATE INDEX "chat_link_code_user_organization_idx" ON "chat_link_code" ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_reminder_account_kind_date_uidx" ON "credit_card_reminder" ("account_id","kind","event_date");--> statement-breakpoint
CREATE INDEX "credit_card_reminder_organization_status_idx" ON "credit_card_reminder" ("organization_id","status","event_date");--> statement-breakpoint
CREATE INDEX "credit_card_reminder_statement_idx" ON "credit_card_reminder" ("statement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_statement_account_date_uidx" ON "credit_card_statement" ("account_id","statement_date");--> statement-breakpoint
CREATE INDEX "credit_card_statement_organization_date_idx" ON "credit_card_statement" ("organization_id","statement_date");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_source_pair_date_uidx" ON "exchange_rate" ("source","base_currency","quote_currency","rate_date");--> statement-breakpoint
CREATE UNIQUE INDEX "file_key_uidx" ON "file" ("key");--> statement-breakpoint
CREATE INDEX "file_organizationId_idx" ON "file" ("organization_id");--> statement-breakpoint
CREATE INDEX "file_userId_idx" ON "file" ("user_id");--> statement-breakpoint
CREATE INDEX "file_status_idx" ON "file" ("status");--> statement-breakpoint
CREATE INDEX "financial_account_organization_archived_idx" ON "financial_account" ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "financial_account_organization_type_idx" ON "financial_account" ("organization_id","account_class","account_type");--> statement-breakpoint
CREATE INDEX "financial_account_balance_snapshot_account_date_idx" ON "financial_account_balance_snapshot" ("account_id","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_account_owner_account_member_uidx" ON "financial_account_owner" ("financial_account_id","member_id");--> statement-breakpoint
CREATE INDEX "financial_account_owner_member_idx" ON "financial_account_owner" ("member_id");--> statement-breakpoint
CREATE INDEX "financial_transaction_organization_date_idx" ON "financial_transaction" ("organization_id","archived_at","transaction_date");--> statement-breakpoint
CREATE INDEX "financial_transaction_account_date_idx" ON "financial_transaction" ("account_id","archived_at","transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_reconciliation_snapshot_uidx" ON "financial_transaction" ("reconciliation_snapshot_id");--> statement-breakpoint
CREATE INDEX "financial_transaction_category_idx" ON "financial_transaction" ("category_id");--> statement-breakpoint
CREATE INDEX "financial_transaction_transfer_idx" ON "financial_transaction" ("transfer_id");--> statement-breakpoint
CREATE INDEX "financial_transaction_organization_amount_idx" ON "financial_transaction" ("organization_id","archived_at","amount","id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_account_import_fingerprint_uidx" ON "financial_transaction" ("account_id","import_fingerprint") WHERE "import_fingerprint" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_recurring_occurrence_uidx" ON "financial_transaction" ("recurring_schedule_id","recurring_occurrence_date") WHERE "recurring_schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_attachment_file_uidx" ON "financial_transaction_attachment" ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_split_transaction_order_uidx" ON "financial_transaction_split" ("transaction_id","sort_order");--> statement-breakpoint
CREATE INDEX "financial_transaction_split_category_idx" ON "financial_transaction_split" ("category_id");--> statement-breakpoint
CREATE INDEX "financial_transaction_tag_tag_transaction_idx" ON "financial_transaction_tag" ("tag_id","transaction_id");--> statement-breakpoint
CREATE INDEX "financial_transfer_organization_date_idx" ON "financial_transfer" ("organization_id","transaction_date","id");--> statement-breakpoint
CREATE INDEX "financial_transfer_source_account_idx" ON "financial_transfer" ("source_account_id","transaction_date","id");--> statement-breakpoint
CREATE INDEX "financial_transfer_destination_account_idx" ON "financial_transfer" ("destination_account_id","transaction_date","id");--> statement-breakpoint
CREATE UNIQUE INDEX "household_exchange_rate_pair_date_uidx" ON "household_exchange_rate" ("organization_id","from_currency","to_currency","rate_date");--> statement-breakpoint
CREATE INDEX "interest_product_institution_idx" ON "interest_product" ("institution_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" ("slug");--> statement-breakpoint
CREATE INDEX "post_migration_status_idx" ON "post_migration" ("status");--> statement-breakpoint
CREATE INDEX "recurring_schedule_organization_idx" ON "recurring_schedule" ("organization_id","status","next_occurrence_date");--> statement-breakpoint
CREATE INDEX "recurring_schedule_due_idx" ON "recurring_schedule" ("next_occurrence_date") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "recurring_schedule_account_idx" ON "recurring_schedule" ("account_id");--> statement-breakpoint
CREATE INDEX "recurring_schedule_category_idx" ON "recurring_schedule" ("category_id");--> statement-breakpoint
CREATE INDEX "recurring_schedule_tag_tag_idx" ON "recurring_schedule_tag" ("tag_id");--> statement-breakpoint
CREATE INDEX "savings_goal_organization_idx" ON "savings_goal" ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "savings_goal_account_idx" ON "savings_goal" ("account_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "tag_organization_archived_idx" ON "tag" ("organization_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_organization_name_uidx" ON "tag" ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "transaction_import_organization_idx" ON "transaction_import" ("organization_id","id");--> statement-breakpoint
CREATE INDEX "transaction_import_checksum_idx" ON "transaction_import" ("organization_id","checksum");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_import_row_import_row_uidx" ON "transaction_import_row" ("import_id","row_number");--> statement-breakpoint
CREATE INDEX "transaction_import_row_import_status_idx" ON "transaction_import_row" ("import_id","status","row_number");--> statement-breakpoint
CREATE INDEX "transaction_import_row_transaction_idx" ON "transaction_import_row" ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_import_row_organization_idx" ON "transaction_import_row" ("organization_id");--> statement-breakpoint
CREATE INDEX "transaction_rule_tag_tag_idx" ON "transaction_rule_tag" ("tag_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_token_cap" ADD CONSTRAINT "ai_token_cap_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_calendar_feed" ADD CONSTRAINT "bill_calendar_feed_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_calendar_feed" ADD CONSTRAINT "bill_calendar_feed_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_confirmed_by_user_id_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_schedule_id_fkey" FOREIGN KEY ("organization_id","schedule_id") REFERENCES "recurring_schedule"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chat_link" ADD CONSTRAINT "chat_link_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_link" ADD CONSTRAINT "chat_link_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_link_code" ADD CONSTRAINT "chat_link_code_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_link_code" ADD CONSTRAINT "chat_link_code_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_dismissed_by_user_id_user_id_fkey" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "credit_card_reminder" ADD CONSTRAINT "credit_card_reminder_statement_id_fkey" FOREIGN KEY ("organization_id","statement_id") REFERENCES "credit_card_statement"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_statement" ADD CONSTRAINT "credit_card_statement_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_card_statement" ADD CONSTRAINT "credit_card_statement_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_base_currency_currency_code_fkey" FOREIGN KEY ("base_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_quote_currency_currency_code_fkey" FOREIGN KEY ("quote_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_institution_id_financial_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "financial_account_balance_snapshot_zGLPH3UWepV5_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "financial_account_balance_snapshot_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_interest" ADD CONSTRAINT "financial_account_interest_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_interest" ADD CONSTRAINT "financial_account_interest_product_id_interest_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "interest_product"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_interest" ADD CONSTRAINT "financial_account_interest_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_interest_rate" ADD CONSTRAINT "financial_account_interest_rate_21bBDvIgaXQL_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_interest_rate" ADD CONSTRAINT "financial_account_interest_rate_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account_interest"("organization_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_financial_account_id_fkey" FOREIGN KEY ("organization_id","financial_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_member_id_fkey" FOREIGN KEY ("organization_id","member_id") REFERENCES "member"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_transfer_id_fkey" FOREIGN KEY ("organization_id","transfer_id") REFERENCES "financial_transfer"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "transaction_reconciliation_snapshot_fkey" FOREIGN KEY ("organization_id","account_id","reconciliation_snapshot_id") REFERENCES "financial_account_balance_snapshot"("organization_id","account_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_recurring_schedule_id_fkey" FOREIGN KEY ("organization_id","recurring_schedule_id") REFERENCES "recurring_schedule"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_ZiOJz7zZRNKY_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_file_id_fkey" FOREIGN KEY ("organization_id","file_id") REFERENCES "file"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_attachment" ADD CONSTRAINT "financial_transaction_attachment_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_KlNOG6P6nad5_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_split" ADD CONSTRAINT "financial_transaction_split_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_tag_id_fkey" FOREIGN KEY ("organization_id","tag_id") REFERENCES "tag"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transaction_tag" ADD CONSTRAINT "financial_transaction_tag_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_source_account_id_fkey" FOREIGN KEY ("organization_id","source_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_transfer" ADD CONSTRAINT "financial_transfer_destination_account_id_fkey" FOREIGN KEY ("organization_id","destination_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_from_currency_currency_code_fkey" FOREIGN KEY ("from_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_to_currency_currency_code_fkey" FOREIGN KEY ("to_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "interest_credit" ADD CONSTRAINT "interest_credit_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interest_credit" ADD CONSTRAINT "interest_credit_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_credit" ADD CONSTRAINT "interest_credit_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_product" ADD CONSTRAINT "interest_product_GclxaGg0cBYy_fkey" FOREIGN KEY ("channel_institution_id") REFERENCES "financial_institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_product" ADD CONSTRAINT "interest_product_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_product" ADD CONSTRAINT "interest_product_institution_id_financial_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_rate_schedule" ADD CONSTRAINT "interest_rate_schedule_product_id_interest_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "interest_product"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_default_currency_currency_code_fkey" FOREIGN KEY ("default_currency") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_schedule_id_fkey" FOREIGN KEY ("organization_id","schedule_id") REFERENCES "recurring_schedule"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_tag_id_fkey" FOREIGN KEY ("organization_id","tag_id") REFERENCES "tag"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_default_expense_category_id_fkey" FOREIGN KEY ("organization_id","default_expense_category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_default_income_category_id_fkey" FOREIGN KEY ("organization_id","default_income_category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction_import" ADD CONSTRAINT "transaction_import_source_file_id_fkey" FOREIGN KEY ("organization_id","source_file_id") REFERENCES "file"("organization_id","id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_import_id_fkey" FOREIGN KEY ("organization_id","import_id") REFERENCES "transaction_import"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_category_id_fkey" FOREIGN KEY ("organization_id","category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD CONSTRAINT "transaction_import_row_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_match_account_id_fkey" FOREIGN KEY ("organization_id","match_account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_set_category_id_fkey" FOREIGN KEY ("organization_id","set_category_id") REFERENCES "category"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_rule_id_fkey" FOREIGN KEY ("organization_id","rule_id") REFERENCES "transaction_rule"("organization_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_tag_id_fkey" FOREIGN KEY ("organization_id","tag_id") REFERENCES "tag"("organization_id","id") ON DELETE RESTRICT;