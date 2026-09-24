CREATE TABLE "category_budget" (
	"amount" numeric(30,6) NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"currency_code" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"month" date NOT NULL,
	"organization_id" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "category_budget_positive_amount_chk" CHECK ("amount" > 0),
	CONSTRAINT "category_budget_month_start_chk" CHECK (EXTRACT(DAY FROM "month") = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "category_budget_organization_month_category_uidx" ON "category_budget" ("organization_id","month","category_id");--> statement-breakpoint
CREATE INDEX "category_budget_category_idx" ON "category_budget" ("category_id");--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id");--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_currency_code_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currency"("code") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "category_budget" ADD CONSTRAINT "category_budget_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;