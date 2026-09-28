CREATE TABLE "chat_inbound_message" (
	"channel" text,
	"message_id" text,
	"processed_at" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"transaction_id" uuid,
	CONSTRAINT "chat_inbound_message_pkey" PRIMARY KEY("channel","message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_link" (
	"channel" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"external_name" text,
	"external_user_id" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_link_code" (
	"code_hash" text NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "chat_link_channel_external_user_uidx" ON "chat_link" ("channel","external_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_link_channel_user_organization_uidx" ON "chat_link" ("channel","user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_link_code_hash_uidx" ON "chat_link_code" ("code_hash");--> statement-breakpoint
CREATE INDEX "chat_link_code_user_organization_idx" ON "chat_link_code" ("user_id","organization_id");--> statement-breakpoint
ALTER TABLE "chat_inbound_message" ADD CONSTRAINT "chat_inbound_message_XVLvaTD9BH34_fkey" FOREIGN KEY ("transaction_id") REFERENCES "financial_transaction"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "chat_link" ADD CONSTRAINT "chat_link_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_link" ADD CONSTRAINT "chat_link_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_link_code" ADD CONSTRAINT "chat_link_code_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "chat_link_code" ADD CONSTRAINT "chat_link_code_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;