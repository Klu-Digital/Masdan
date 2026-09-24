CREATE TABLE "recurring_schedule" (
	"account_id" uuid NOT NULL,
	"amount" numeric(30,6) NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"frequency" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"interval" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"name" text NOT NULL,
	"next_occurrence_date" date,
	"notes" text,
	"organization_id" uuid NOT NULL,
	"paid_status" "paid_status" DEFAULT 'paid'::"paid_status" NOT NULL,
	"paused_at" timestamp,
	"start_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stopped_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_schedule_positive_amount_chk" CHECK ("amount" > 0),
	CONSTRAINT "recurring_schedule_interval_chk" CHECK ("interval" BETWEEN 1 AND 366),
	CONSTRAINT "recurring_schedule_next_occurrence_chk" CHECK (("status" = 'stopped') = ("next_occurrence_date" IS NULL)
        AND ("next_occurrence_date" IS NULL OR "next_occurrence_date" >= "start_date"))
);
--> statement-breakpoint
CREATE TABLE "recurring_schedule_tag" (
	"schedule_id" uuid,
	"tag_id" uuid,
	CONSTRAINT "recurring_schedule_tag_pkey" PRIMARY KEY("schedule_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "recurring_occurrence_date" date;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD COLUMN "recurring_schedule_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transaction_recurring_occurrence_uidx" ON "financial_transaction" ("recurring_schedule_id","recurring_occurrence_date") WHERE "recurring_schedule_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recurring_schedule_organization_idx" ON "recurring_schedule" ("organization_id","status","next_occurrence_date");--> statement-breakpoint
CREATE INDEX "recurring_schedule_due_idx" ON "recurring_schedule" ("next_occurrence_date") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX "recurring_schedule_account_idx" ON "recurring_schedule" ("account_id");--> statement-breakpoint
CREATE INDEX "recurring_schedule_category_idx" ON "recurring_schedule" ("category_id");--> statement-breakpoint
CREATE INDEX "recurring_schedule_tag_tag_idx" ON "recurring_schedule_tag" ("tag_id");--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_recurring_schedule_id_fkey" FOREIGN KEY ("recurring_schedule_id") REFERENCES "recurring_schedule"("id");--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_account_id_financial_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_category_id_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_schedule_id_recurring_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recurring_schedule"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recurring_schedule_tag" ADD CONSTRAINT "recurring_schedule_tag_tag_id_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "financial_transaction" ADD CONSTRAINT "financial_transaction_recurring_occurrence_chk" CHECK (("recurring_schedule_id" IS NULL) = ("recurring_occurrence_date" IS NULL));