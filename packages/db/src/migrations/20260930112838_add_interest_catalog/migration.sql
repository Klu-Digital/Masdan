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
ALTER TABLE "financial_account" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
CREATE INDEX "interest_product_institution_idx" ON "interest_product" ("institution_id");--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_institution_id_financial_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_interest" ADD CONSTRAINT "financial_account_interest_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_interest" ADD CONSTRAINT "financial_account_interest_product_id_interest_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "interest_product"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_interest" ADD CONSTRAINT "financial_account_interest_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account_interest_rate" ADD CONSTRAINT "financial_account_interest_rate_21bBDvIgaXQL_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_interest_rate" ADD CONSTRAINT "financial_account_interest_rate_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account_interest"("organization_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interest_credit" ADD CONSTRAINT "interest_credit_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "interest_credit" ADD CONSTRAINT "interest_credit_account_id_fkey" FOREIGN KEY ("organization_id","account_id") REFERENCES "financial_account"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_credit" ADD CONSTRAINT "interest_credit_transaction_id_fkey" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "financial_transaction"("organization_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_product" ADD CONSTRAINT "interest_product_GclxaGg0cBYy_fkey" FOREIGN KEY ("channel_institution_id") REFERENCES "financial_institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_product" ADD CONSTRAINT "interest_product_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_product" ADD CONSTRAINT "interest_product_institution_id_financial_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "financial_institution"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "interest_rate_schedule" ADD CONSTRAINT "interest_rate_schedule_product_id_interest_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "interest_product"("id") ON DELETE RESTRICT;