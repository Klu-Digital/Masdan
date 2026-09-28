CREATE TABLE "exchange_rate" (
	"base_currency" text NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"quote_currency" text NOT NULL,
	"rate" numeric(30,12) NOT NULL,
	"rate_date" date NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "exchange_rate_positive_chk" CHECK ("rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "household_exchange_rate" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"from_currency" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"rate" numeric(30,12) NOT NULL,
	"rate_date" date NOT NULL,
	"to_currency" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "household_exchange_rate_positive_chk" CHECK ("rate" > 0),
	CONSTRAINT "household_exchange_rate_pair_chk" CHECK ("from_currency" <> "to_currency")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rate_source_pair_date_uidx" ON "exchange_rate" ("source","base_currency","quote_currency","rate_date");--> statement-breakpoint
CREATE UNIQUE INDEX "household_exchange_rate_pair_date_uidx" ON "household_exchange_rate" ("organization_id","from_currency","to_currency","rate_date");--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_base_currency_currency_code_fkey" FOREIGN KEY ("base_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_quote_currency_currency_code_fkey" FOREIGN KEY ("quote_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_created_by_user_id_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_from_currency_currency_code_fkey" FOREIGN KEY ("from_currency") REFERENCES "currency"("code");--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "household_exchange_rate" ADD CONSTRAINT "household_exchange_rate_to_currency_currency_code_fkey" FOREIGN KEY ("to_currency") REFERENCES "currency"("code");