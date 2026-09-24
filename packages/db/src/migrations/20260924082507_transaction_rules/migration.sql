CREATE TABLE "transaction_rule" (
	"created_at" timestamp DEFAULT now() NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_rule_text_operator_chk" CHECK (("match_text" IS NULL) = ("match_text_operator" IS NULL)),
	CONSTRAINT "transaction_rule_has_condition_chk" CHECK (num_nonnulls("match_text", "match_type", "match_account_id", "match_amount_min", "match_amount_max") > 0),
	CONSTRAINT "transaction_rule_amount_range_chk" CHECK (("match_amount_min" IS NULL OR "match_amount_min" > 0)
        AND ("match_amount_max" IS NULL OR "match_amount_max" > 0)
        AND ("match_amount_min" IS NULL OR "match_amount_max" IS NULL OR "match_amount_min" <= "match_amount_max"))
);
--> statement-breakpoint
CREATE TABLE "transaction_rule_tag" (
	"rule_id" uuid,
	"tag_id" uuid,
	CONSTRAINT "transaction_rule_tag_pkey" PRIMARY KEY("rule_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "rule_application" jsonb;--> statement-breakpoint
ALTER TABLE "transaction_import_row" ADD COLUMN "rule_application" jsonb;--> statement-breakpoint
CREATE INDEX "transaction_rule_organization_position_idx" ON "transaction_rule" ("organization_id","position","id");--> statement-breakpoint
CREATE INDEX "transaction_rule_tag_tag_idx" ON "transaction_rule_tag" ("tag_id");--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_match_account_id_financial_account_id_fkey" FOREIGN KEY ("match_account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule" ADD CONSTRAINT "transaction_rule_set_category_id_category_id_fkey" FOREIGN KEY ("set_category_id") REFERENCES "category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_rule_id_transaction_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "transaction_rule"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transaction_rule_tag" ADD CONSTRAINT "transaction_rule_tag_tag_id_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE;