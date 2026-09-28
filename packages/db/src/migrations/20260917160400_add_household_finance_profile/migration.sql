CREATE TABLE "currency" (
	"code" text PRIMARY KEY,
	"enabled" boolean DEFAULT true NOT NULL,
	"minor_units" smallint NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"symbol_native" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "default_currency" text DEFAULT 'PHP' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "timezone" text DEFAULT 'Asia/Manila' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_default_currency_currency_code_fkey" FOREIGN KEY ("default_currency") REFERENCES "currency"("code") ON DELETE RESTRICT;