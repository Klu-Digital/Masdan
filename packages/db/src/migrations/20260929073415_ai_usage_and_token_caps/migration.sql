CREATE TABLE "ai_token_cap" (
	"feature" text PRIMARY KEY,
	"max_tokens" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
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
ALTER TABLE "ai_token_cap" ADD CONSTRAINT "ai_token_cap_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;