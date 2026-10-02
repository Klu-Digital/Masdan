ALTER TABLE "recurring_schedule" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "recurring_schedule" ADD CONSTRAINT "recurring_schedule_end_date_chk" CHECK ("end_date" IS NULL OR ("end_date" >= "start_date"
        AND ("next_occurrence_date" IS NULL OR "next_occurrence_date" <= "end_date")));