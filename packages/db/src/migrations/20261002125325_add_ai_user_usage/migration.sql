CREATE TABLE "ai_user_usage" (
	"day" date,
	"requests" integer DEFAULT 0 NOT NULL,
	"tokens" bigint DEFAULT 0 NOT NULL,
	"user_id" uuid,
	CONSTRAINT "ai_user_usage_pkey" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "ai_user_usage" ADD CONSTRAINT "ai_user_usage_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;