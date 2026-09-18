CREATE TABLE "financial_account" (
	"account_class" text NOT NULL,
	"account_type" text NOT NULL,
	"archived_at" timestamp,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"currency_code" text NOT NULL,
	"icon" text,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"institution" text,
	"liquidity" text,
	"name" text NOT NULL,
	"notes" text,
	"opening_balance" numeric(30,6) DEFAULT '0' NOT NULL,
	"opening_balance_date" date DEFAULT now() NOT NULL,
	"organization_id" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_account_balance_snapshot" (
	"account_id" uuid NOT NULL,
	"balance" numeric(30,6) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"effective_date" date NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"import_reference" text,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_account_owner" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"member_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "financial_account_organization_archived_idx" ON "financial_account" ("organization_id","archived_at");--> statement-breakpoint
CREATE INDEX "financial_account_organization_type_idx" ON "financial_account" ("organization_id","account_class","account_type");--> statement-breakpoint
CREATE INDEX "financial_account_balance_snapshot_account_date_idx" ON "financial_account_balance_snapshot" ("account_id","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_account_owner_account_member_uidx" ON "financial_account_owner" ("financial_account_id","member_id");--> statement-breakpoint
CREATE INDEX "financial_account_owner_member_idx" ON "financial_account_owner" ("member_id");--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_balance_snapshot" ADD CONSTRAINT "financial_account_balance_snapshot_So432hpv04KX_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_vLgDrwpOJ0pn_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_account_owner" ADD CONSTRAINT "financial_account_owner_member_id_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE CASCADE;